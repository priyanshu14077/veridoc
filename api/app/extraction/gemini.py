"""Gemini extraction call (TDD §5.1). One call per document, schema-bound JSON output."""

import io
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from google import genai
from google.genai import errors, types
from opentelemetry import trace
from PIL import Image
from pydantic import BaseModel, Field, ValidationError, create_model

from app import telemetry
from app.config import get_settings
from app.extraction.catalog import HEADER, LINES

PROMPT_VERSION = "v1"
_PROMPT = (Path(__file__).parent / "prompts" / f"{PROMPT_VERSION}.md").read_text()
DOC_LABEL = {
    "invoice": "commercial invoice",
    "packing_list": "packing list",
    "bill_of_lading": "bill of lading",
}


class Extracted(BaseModel):
    value: str | None
    confidence: float = Field(ge=0, le=1)
    page: int | None = None
    box_2d: list[int] | None = None


class PageInfo(BaseModel):
    page: int
    readable: bool
    reason: str | None = None


@lru_cache
def response_model(doc_type: str) -> type[BaseModel]:
    header = {f.key: (Extracted, ...) for f in HEADER[doc_type]}
    fields: dict[str, Any] = {
        "detected_doc_type": (Literal["invoice", "packing_list", "bill_of_lading", "other"], ...),
        "pages": (list[PageInfo], ...),
        **header,
    }
    if LINES[doc_type]:
        line = create_model(
            f"{doc_type}_line", **{f.key: (Extracted, ...) for f in LINES[doc_type]}
        )
        fields["lines"] = (list[line], ...)  # type: ignore[valid-type]
    return create_model(f"{doc_type}_extraction", **fields)


def build_prompt(doc_type: str) -> str:
    notes = []
    for f in (*HEADER[doc_type], *LINES[doc_type]):
        note = f"- {f.key}: {f.label}" + (f". {f.hint}" if f.hint else "")
        notes.append(note)
    return _PROMPT.format(doc_label=DOC_LABEL[doc_type], field_notes="\n".join(notes))


class ExtractionError(Exception):
    def __init__(
        self, message: str, retryable: bool, retry_after_s: int | None = None, quota: bool = False
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.retry_after_s = retry_after_s  # when the provider told us how long to wait
        self.quota = quota  # out of quota rather than broken: don't spend a retry attempt


def _retry_delay_s(e: errors.APIError) -> int | None:
    """Google's RetryInfo, e.g. {'retryDelay': '4730s'}."""
    details = (getattr(e, "details", None) or {}).get("error", {}).get("details", [])
    for d in details if isinstance(details, list) else []:
        delay = d.get("retryDelay") if isinstance(d, dict) else None
        if isinstance(delay, str) and delay.endswith("s"):
            try:
                return int(float(delay[:-1]))
            except ValueError:
                return None
    return None


@dataclass
class ExtractionResult:
    parsed: BaseModel
    raw: dict[str, Any]
    model: str
    latency_ms: int
    tokens_in: int | None
    tokens_out: int | None


def prepare_input(data: bytes, mime: str) -> tuple[bytes, str]:
    """PDFs go as-is; images are downscaled to 2,000 px on the long edge and re-encoded."""
    if mime == "application/pdf":
        return data, mime
    img = Image.open(io.BytesIO(data))
    img.thumbnail((2000, 2000))
    out = io.BytesIO()
    img.convert("RGB").save(out, "JPEG", quality=85)
    return out.getvalue(), "image/jpeg"


@lru_cache
def _client() -> genai.Client:
    s = get_settings()
    if not s.gemini_api_key:
        raise ExtractionError("GEMINI_API_KEY is not configured", retryable=False)
    return genai.Client(
        api_key=s.gemini_api_key,
        http_options=types.HttpOptions(
            timeout=s.gemini_timeout_s * 1000,
            retry_options=types.HttpRetryOptions(attempts=1),  # our job queue owns retries
        ),
    )


def _call(
    model: str,
    contents: list[Any],
    config: types.GenerateContentConfig,
    schema: type[BaseModel],
    quota_waits: list[int],
) -> tuple[str, ExtractionResult | None, ExtractionError | None]:
    """One request to one model: (outcome, result, error). Records the call metrics."""
    t0 = time.monotonic()
    outcome, result, err = "ok", None, None
    try:
        resp = _client().models.generate_content(model=model, contents=contents, config=config)
    except errors.APIError as e:
        code = getattr(e, "code", None) or 0
        if code == 429:
            # Out of quota on this model (the free tier caps requests per model per day).
            # Each model has its own quota, so the next one may still work.
            quota_waits.append(_retry_delay_s(e) or 60)
            outcome, err = "quota", ExtractionError(f"{model}: quota exhausted", retryable=True)
        else:
            err = ExtractionError(
                f"{model}: HTTP {code}: {str(e)[:200]}", retryable=code in (408, 500, 502, 503, 504)
            )
            # Overloaded or retired: try the next model. Anything else stops here.
            outcome = "overloaded" if code in (503, 504, 404) else "bad_status"
    except Exception as e:  # network errors, timeouts
        outcome = "network"
        err = ExtractionError(f"{model}: {type(e).__name__}: {str(e)[:200]}", retryable=True)
    else:
        latency = int((time.monotonic() - t0) * 1000)
        try:
            parsed = schema.model_validate_json(resp.text or "")
        except ValidationError as e:
            outcome = "bad_schema"
            err = ExtractionError(
                f"{model}: response did not match schema: {e.errors()[:2]}", retryable=True
            )
        else:
            usage = resp.usage_metadata
            result = ExtractionResult(
                parsed=parsed,
                raw=parsed.model_dump(),
                model=model,
                latency_ms=latency,
                tokens_in=usage.prompt_token_count if usage else None,
                tokens_out=usage.candidates_token_count if usage else None,
            )
    attrs = {"model": model, "outcome": outcome}
    telemetry.gemini_calls.add(1, attrs)
    telemetry.gemini_duration.record(time.monotonic() - t0, attrs)
    return outcome, result, err


def extract(data: bytes, mime: str, doc_type: str) -> ExtractionResult:
    s = get_settings()
    schema = response_model(doc_type)
    payload, payload_mime = prepare_input(data, mime)
    contents = [types.Part.from_bytes(data=payload, mime_type=payload_mime), build_prompt(doc_type)]
    config = types.GenerateContentConfig(
        response_mime_type="application/json", response_schema=schema, temperature=0
    )
    last: ExtractionError | None = None
    quota_waits: list[int] = []
    for model in [s.gemini_model, *s.gemini_fallback_models]:
        with telemetry.tracer.start_as_current_span(
            "gemini generate_content",
            attributes={"gen_ai.system": "gemini", "gen_ai.request.model": model},
        ) as span:
            outcome, result, err = _call(model, contents, config, schema, quota_waits)
            span.set_attribute("veridoc.outcome", outcome)
            if result is not None:
                span.set_attribute("gen_ai.usage.input_tokens", result.tokens_in or 0)
                span.set_attribute("gen_ai.usage.output_tokens", result.tokens_out or 0)
                return result
            assert err is not None
            span.set_status(trace.StatusCode.ERROR, str(err))
            last = err
            if outcome in ("bad_status", "bad_schema"):
                raise err
    if quota_waits and len(quota_waits) == 1 + len(s.gemini_fallback_models):
        raise ExtractionError(
            "AI quota exhausted on every configured model",
            retryable=True,
            retry_after_s=min(quota_waits),
            quota=True,
        )
    assert last is not None
    raise last
