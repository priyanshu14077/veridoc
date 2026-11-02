"""Shared helpers for tests that upload documents and run the extraction worker."""

import json
from pathlib import Path

from sqlalchemy import select

from app import jobs
from app.db import SessionLocal
from app.extraction.catalog import HEADER, LINES
from app.extraction.gemini import ExtractionResult, response_model
from app.models import Shipment
from app.worker import handle

SAMPLES = Path(__file__).resolve().parents[2] / "sample-docs"


def fake_result(
    doc_type: str,
    ref: str = "SHP-24812",
    conf: float = 0.97,
    overrides: dict | None = None,
    unreadable: bool = False,
) -> ExtractionResult:
    truth = json.loads((SAMPLES / ref / "truth.json").read_text())[doc_type]

    def item(v: str | None, c: float = conf) -> dict:
        return {"value": v, "confidence": c, "page": 1, "box_2d": None}

    data: dict = {
        "detected_doc_type": doc_type,
        "pages": [{"page": 1, "readable": not unreadable, "reason": None}],
    }
    for f in HEADER[doc_type]:
        data[f.key] = item(truth["header"].get(f.key))
    if LINES[doc_type]:
        data["lines"] = [
            {f.key: item(line.get(f.key)) for f in LINES[doc_type]} for line in truth["lines"]
        ]
    for key, (value, c) in (overrides or {}).items():
        data[key] = item(value, c)
    parsed = response_model(doc_type).model_validate(data)
    return ExtractionResult(parsed, parsed.model_dump(), "fake-model", 10, 100, 50)


def shipment_id(db, ref: str) -> int:
    return db.scalar(select(Shipment.id).where(Shipment.ref == ref))


def upload(
    client,
    sid: int,
    doc_type: str,
    ref: str = "SHP-24812",
    data: bytes | None = None,
    name: str | None = None,
):
    body = data if data is not None else (SAMPLES / ref / f"{doc_type}.pdf").read_bytes()
    return client.post(
        f"/api/shipments/{sid}/documents",
        data={"doc_type": doc_type},
        files={"file": (name or f"{doc_type}.pdf", body, "application/pdf")},
    )


def run_next_job() -> None:
    with SessionLocal() as db:
        job = jobs.claim(db)
    assert job is not None, "expected a queued job"
    handle(job)
