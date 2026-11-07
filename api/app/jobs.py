"""Postgres-backed job queue (TDD §2). Enqueue in the same transaction as the data it refers to;
workers claim with FOR UPDATE SKIP LOCKED so two workers never take the same job."""

import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.telemetry import inject_context

BACKOFF_S = (5, 20, 60)  # TDD §5.5
MAX_ATTEMPTS = len(BACKOFF_S)
STALE_AFTER_S = 300  # a job "running" this long is assumed orphaned by a dead worker


@dataclass
class Job:
    id: int
    kind: str
    payload: dict[str, Any]
    attempts: int


def enqueue(db: Session, kind: str, payload: dict[str, Any]) -> None:
    # The worker continues the uploader's trace, so one trace shows upload → extraction.
    if trace_ctx := inject_context():
        payload = {**payload, "trace": trace_ctx}
    db.execute(
        text("INSERT INTO jobs (kind, payload) VALUES (:k, CAST(:p AS jsonb))"),
        {"k": kind, "p": json.dumps(payload)},
    )


def claim(db: Session) -> Job | None:
    row = db.execute(
        text(
            """
            UPDATE jobs SET status = 'running', locked_at = now(), attempts = attempts + 1
            WHERE id = (
                SELECT id FROM jobs
                WHERE (status = 'queued' AND run_after <= now())
                   OR (status = 'running' AND locked_at < now() - make_interval(secs => :stale))
                ORDER BY run_after, id
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id, kind, payload, attempts
            """
        ),
        {"stale": STALE_AFTER_S},
    ).one_or_none()
    db.commit()
    return Job(row.id, row.kind, row.payload, row.attempts) if row else None


def complete(db: Session, job_id: int) -> None:
    db.execute(
        text("UPDATE jobs SET status = 'done', locked_at = NULL WHERE id = :id"), {"id": job_id}
    )


def fail(
    db: Session,
    job: Job,
    error: str,
    retryable: bool,
    delay_s: int | None = None,
    consume_attempt: bool = True,
) -> bool:
    """Reschedule with backoff, or mark failed. Returns True if it will be retried.

    A provider-specified delay (quota reset) replaces the backoff, and quota waits don't spend
    one of the job's attempts: running out of quota isn't the document's fault."""
    if retryable and not consume_attempt:
        db.execute(
            text(
                "UPDATE jobs SET status = 'queued', locked_at = NULL, last_error = :e,"
                " attempts = attempts - 1, run_after = now() + make_interval(secs => :d)"
                " WHERE id = :id"
            ),
            {"e": error[:2000], "d": delay_s or BACKOFF_S[0], "id": job.id},
        )
        return True
    if retryable and job.attempts < MAX_ATTEMPTS:
        db.execute(
            text(
                "UPDATE jobs SET status = 'queued', locked_at = NULL, last_error = :e,"
                " run_after = now() + make_interval(secs => :d) WHERE id = :id"
            ),
            {"e": error[:2000], "d": delay_s or BACKOFF_S[job.attempts - 1], "id": job.id},
        )
        return True
    db.execute(
        text("UPDATE jobs SET status = 'failed', locked_at = NULL, last_error = :e WHERE id = :id"),
        {"e": error[:2000], "id": job.id},
    )
    return False


def cancel_for_document(db: Session, document_id: int) -> None:
    """Drop queued work for a document (e.g. the user chose manual entry while it waited)."""
    db.execute(
        text(
            "UPDATE jobs SET status = 'failed', last_error = 'cancelled: manual entry'"
            " WHERE status = 'queued' AND (payload->>'document_id')::bigint = :d"
        ),
        {"d": document_id},
    )
