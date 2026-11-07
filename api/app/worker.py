"""Extraction worker. Run: python -m app.worker

Claims jobs from Postgres, calls Gemini at most GEMINI_RPM times a minute, and retries with
backoff. Safe to run several copies: claims use FOR UPDATE SKIP LOCKED.
"""

import logging
import signal
import time
from datetime import UTC, datetime, timedelta, timezone

from opentelemetry import trace
from opentelemetry.metrics import Observation
from sqlalchemy import text

from app import jobs, telemetry
from app.config import get_settings
from app.db import SessionLocal
from app.extraction.gemini import ExtractionError
from app.extraction.pipeline import process, record_failure
from app.models import Document

log = logging.getLogger("veridoc.worker")


def quota_message(retry_after_s: int | None) -> str:
    when = datetime.now(UTC) + timedelta(seconds=retry_after_s or 60)
    ist = when.astimezone(timezone(timedelta(hours=5, minutes=30)))
    return (
        f"Daily AI limit reached. It will retry by itself at {ist:%H:%M} IST, "
        "or you can enter the fields by hand."
    )


class RateLimiter:
    def __init__(self, per_minute: int) -> None:
        self.interval = 60.0 / max(1, per_minute)
        self.next_at = 0.0

    def wait(self) -> None:
        now = time.monotonic()
        if now < self.next_at:
            time.sleep(self.next_at - now)
        self.next_at = max(now, self.next_at) + self.interval


def handle(job: jobs.Job, limiter: RateLimiter | None = None) -> None:
    # Continue the trace of the upload that queued this job.
    parent = telemetry.extract_context(job.payload.get("trace"))
    with telemetry.tracer.start_as_current_span(
        "extract document",
        context=parent,
        kind=trace.SpanKind.CONSUMER,
        attributes={
            "veridoc.document_id": job.payload.get("document_id", 0),
            "veridoc.job_id": job.id,
            "veridoc.attempt": job.attempts,
        },
    ):
        _handle(job, limiter)


def _handle(job: jobs.Job, limiter: RateLimiter | None) -> None:
    with SessionLocal() as db:
        doc = db.get(Document, job.payload["document_id"])
        if doc is None or doc.superseded_at is not None:
            jobs.complete(db, job.id)  # replaced or deleted since it was queued
            db.commit()
            return
        try:
            if limiter:
                limiter.wait()
            process(db, doc, job.attempts)
            jobs.complete(db, job.id)
            db.commit()
            _count(doc.doc_type, doc.extraction_status)
        except ExtractionError as e:
            db.rollback()
            doc = db.get(Document, job.payload["document_id"])
            assert doc is not None
            retrying = jobs.fail(
                db, job, str(e), e.retryable, delay_s=e.retry_after_s, consume_attempt=not e.quota
            )
            record_failure(db, doc, str(e), job.attempts, final=not retrying)
            if retrying:
                doc.extraction_status = "pending"
                doc.error = quota_message(e.retry_after_s) if e.quota else None
            db.commit()
            _count(doc.doc_type, "quota_wait" if e.quota else "retrying" if retrying else "failed")
            trace.get_current_span().set_status(trace.StatusCode.ERROR, str(e))
            log.warning(
                "doc=%s attempt=%s %s: %s",
                doc.id,
                job.attempts,
                "retrying" if retrying else "failed",
                e,
            )
        except Exception as e:  # a bug, not a model error: fail the job, keep the worker alive
            db.rollback()
            log.exception("doc=%s crashed", job.payload.get("document_id"))
            doc = db.get(Document, job.payload["document_id"])
            jobs.fail(db, job, f"{type(e).__name__}: {e}", retryable=False)
            if doc:
                record_failure(db, doc, f"{type(e).__name__}: {e}", job.attempts, final=True)
            db.commit()
            _count(doc.doc_type if doc else "unknown", "crashed")
            trace.get_current_span().record_exception(e)
            trace.get_current_span().set_status(trace.StatusCode.ERROR, type(e).__name__)


def _count(doc_type: str, outcome: str) -> None:
    telemetry.extractions.add(1, {"doc_type": doc_type, "outcome": outcome})


def _queue_rows() -> dict[str, tuple[int, float]]:
    """Per status: job count, and seconds the oldest has waited (queued: since due; running:
    since claimed). Future retries don't count as waiting."""
    with SessionLocal() as db:
        rows = db.execute(
            text(
                "SELECT status, count(*) AS n, coalesce(extract(epoch FROM now() - min("
                "   CASE WHEN status = 'running' THEN locked_at"
                "        WHEN run_after <= now() THEN run_after END)), 0) AS oldest_s"
                " FROM jobs WHERE status IN ('queued', 'running') GROUP BY status"
            )
        ).all()
    found = {r.status: (int(r.n), float(r.oldest_s)) for r in rows}
    return {st: found.get(st, (0, 0.0)) for st in ("queued", "running")}


def _register_queue_gauges() -> None:
    telemetry.observe_gauges(
        "veridoc.jobs.count",
        "Jobs waiting or running",
        lambda: [Observation(n, {"status": st}) for st, (n, _) in _queue_rows().items()],
    )
    telemetry.observe_gauges(
        "veridoc.jobs.oldest_age",
        "Seconds the oldest due job has waited (stuck queue)",
        lambda: [Observation(age, {"status": st}) for st, (_, age) in _queue_rows().items()],
        unit="s",
    )


def run() -> None:
    telemetry.setup("veridoc-worker")
    _register_queue_gauges()
    s = get_settings()
    limiter = RateLimiter(s.gemini_rpm)
    stop = False

    def _stop(*_: object) -> None:
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    log.info("worker started (model=%s, %s rpm)", s.gemini_model, s.gemini_rpm)
    while not stop:
        with SessionLocal() as db:
            job = jobs.claim(db)
        if job is None:
            time.sleep(s.worker_poll_s)
            continue
        if job.kind == "extract":
            handle(job, limiter)
        else:
            with SessionLocal() as db:
                jobs.fail(db, job, f"unknown job kind {job.kind}", retryable=False)
                db.commit()


if __name__ == "__main__":
    run()
