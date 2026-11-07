"""Gemini model fallback, the metrics it records, JSON logs and trace hand-off to the worker."""

import json
import logging
from types import SimpleNamespace

import pytest
from google.genai import errors
from opentelemetry import metrics, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace import TracerProvider
from sqlalchemy import text

from app import jobs, telemetry
from app.extraction import gemini
from tests.helpers import fake_result

READER = InMemoryMetricReader()
metrics.set_meter_provider(MeterProvider(metric_readers=[READER]))
TRACER = TracerProvider().get_tracer("test")


def _api_error(code: int) -> errors.APIError:
    body = {"error": {"code": code, "message": "x", "details": [{"retryDelay": "30s"}]}}
    return errors.APIError(code, body)


@pytest.fixture
def models(monkeypatch):
    """Script each model's answer: an exception, or None for a valid response."""
    script: dict[str, Exception | None] = {}
    tried: list[str] = []

    def generate_content(model: str, contents, config):  # noqa: ANN001
        tried.append(model)
        outcome = script.get(model)
        if outcome is not None:
            raise outcome
        body = json.dumps(fake_result("invoice").raw)
        return SimpleNamespace(text=body, usage_metadata=None)

    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_client", lambda: client)
    s = gemini.get_settings()
    monkeypatch.setattr(s, "gemini_model", "m1")
    monkeypatch.setattr(s, "gemini_fallback_models", ["m2", "m3"])
    return script, tried


def _calls() -> dict[tuple[str, str], int]:
    out: dict[tuple[str, str], int] = {}
    data = READER.get_metrics_data()
    for rm in data.resource_metrics if data else []:
        for sm in rm.scope_metrics:
            for m in sm.metrics:
                if m.name == "veridoc.gemini.calls":
                    for p in m.data.data_points:
                        out[(p.attributes["model"], p.attributes["outcome"])] = p.value
    return out


def test_overloaded_model_falls_back_and_each_call_is_counted(models) -> None:
    script, tried = models
    script["m1"] = _api_error(503)
    before = _calls()
    result = gemini.extract(b"%PDF-", "application/pdf", "invoice")
    assert result.model == "m2" and tried == ["m1", "m2"]
    after = _calls()
    assert after[("m1", "overloaded")] - before.get(("m1", "overloaded"), 0) == 1
    assert after[("m2", "ok")] - before.get(("m2", "ok"), 0) == 1


def test_quota_on_every_model_waits_for_the_shortest_reset(models) -> None:
    script, tried = models
    for m in ("m1", "m2", "m3"):
        script[m] = _api_error(429)
    with pytest.raises(gemini.ExtractionError) as e:
        gemini.extract(b"%PDF-", "application/pdf", "invoice")
    assert e.value.quota and e.value.retry_after_s == 30 and tried == ["m1", "m2", "m3"]


def test_bad_request_stops_without_trying_other_models(models) -> None:
    script, tried = models
    script["m1"] = _api_error(400)
    with pytest.raises(gemini.ExtractionError) as e:
        gemini.extract(b"%PDF-", "application/pdf", "invoice")
    assert not e.value.retryable and tried == ["m1"]


def test_json_log_carries_the_trace_id() -> None:
    record = logging.LogRecord("veridoc.test", logging.INFO, __file__, 1, "hi %s", ("x",), None)
    with TRACER.start_as_current_span("s") as span:
        line = json.loads(telemetry.JsonFormatter().format(record))
    assert line["msg"] == "hi x" and line["level"] == "info"
    assert line["trace_id"] == format(span.get_span_context().trace_id, "032x")


def test_queued_job_carries_the_uploaders_trace(db) -> None:
    trace.set_tracer_provider(TracerProvider())
    with trace.get_tracer("test").start_as_current_span("upload") as span:
        jobs.enqueue(db, "extract", {"document_id": 1})
    db.commit()
    payload = db.execute(text("SELECT payload FROM jobs ORDER BY id DESC LIMIT 1")).scalar_one()
    parent = trace.get_current_span(telemetry.extract_context(payload["trace"]))
    assert parent.get_span_context().trace_id == span.get_span_context().trace_id


def test_queue_gauges_count_due_and_running_jobs(db) -> None:
    from app.worker import _queue_rows

    db.execute(text("DELETE FROM jobs"))
    db.execute(
        text(
            "INSERT INTO jobs (kind, payload, status, run_after, locked_at) VALUES"
            " ('extract', '{}', 'queued', now() - interval '10 minutes', NULL),"
            " ('extract', '{}', 'queued', now() + interval '1 hour', NULL),"
            " ('extract', '{}', 'running', now() - interval '1 hour', now() - interval '2 minutes')"
        )
    )
    db.commit()
    rows = _queue_rows()
    assert rows["queued"][0] == 2 and 590 < rows["queued"][1] < 700
    assert rows["running"][0] == 1 and 110 < rows["running"][1] < 200
