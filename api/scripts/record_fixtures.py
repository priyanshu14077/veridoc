"""Run real Gemini extraction on every sample document and save the raw output.

    uv run python scripts/record_fixtures.py [--only SHP-24811] [--force]

Writes sample-docs/<ref>/<doc_type>.extraction.json. The seed replays these through the same
pipeline as live uploads, so the demo shows genuine model output without spending quota.
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402
from app.extraction.gemini import PROMPT_VERSION, ExtractionError, extract  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "sample-docs"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    interval = 60 / get_settings().gemini_rpm
    for pdf in sorted(DOCS.glob("SHP-*/*.pdf")):
        ref, doc_type = pdf.parent.name, pdf.stem
        out = pdf.with_name(f"{doc_type}.extraction.json")
        if (args.only and ref != args.only) or (out.exists() and not args.force):
            continue
        t0 = time.monotonic()
        for attempt in range(1, 4):
            try:
                r = extract(pdf.read_bytes(), "application/pdf", doc_type)
                break
            except ExtractionError as e:
                print(f"{ref} {doc_type} attempt {attempt}: {e}", flush=True)
                if not e.retryable or attempt == 3:
                    raise
                time.sleep(20 * attempt)
        out.write_text(
            json.dumps(
                {
                    "model": r.model,
                    "prompt_version": PROMPT_VERSION,
                    "latency_ms": r.latency_ms,
                    "tokens_in": r.tokens_in,
                    "tokens_out": r.tokens_out,
                    "response": r.raw,
                },
                indent=1,
                ensure_ascii=False,
            )
            + "\n"
        )
        print(
            f"{ref} {doc_type}: {r.model} {r.latency_ms} ms {r.tokens_in}+{r.tokens_out} tok",
            flush=True,
        )
        time.sleep(max(0.0, interval - (time.monotonic() - t0)))


if __name__ == "__main__":
    main()
