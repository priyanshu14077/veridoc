"""Extraction worker. Run: python -m app.worker

Claims jobs from Postgres, calls Gemini at most GEMINI_RPM times a minute, and retries with
backoff. Safe to run several copies: claims use FOR UPDATE SKIP LOCKED.
"""

import logging
import signal
import time
from datetime import UTC, datetime, timedelta, timezone

from app import jobs
from app.config import get_settings
from app.db import SessionLocal
from app.extraction.gemini import ExtractionError
from app.extraction.pipeline import process, record_failure
from app.models import Document

log = logging.getLogger("crosscheck.worker")


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


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
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
