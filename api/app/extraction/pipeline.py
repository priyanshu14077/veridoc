"""Run one document through extraction and store typed, scored fields (TDD §4, §5)."""

import logging
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app import telemetry
from app.extraction import gemini
from app.extraction.catalog import HEADER, LINES, FieldDef
from app.extraction.confidence import score
from app.extraction.validators import normalize_and_validate
from app.models import Document, ExtractionRun, FieldRow, Shipment
from app.shipments.status import recompute_status
from app.storage import get_storage

log = logging.getLogger("veridoc.extraction")
UNREADABLE_NULL_SHARE = 0.7  # TDD A16


def _field(
    doc: Document, fd: FieldDef, item: Any, line: int | None, country: str | None, manual: bool
) -> FieldRow:
    raw = None if manual or item is None else item.value
    norm, errs = normalize_and_validate(fd.kind, raw, country)
    model_conf = None if manual or item is None else item.confidence
    return FieldRow(
        document_id=doc.id,
        key=fd.key,
        line_index=line,
        value=raw,
        normalized=norm,
        ai_value=raw,
        model_confidence=model_conf,
        confidence=score(model_conf, raw, fd.required, errs),
        validator_errors=errs,
        status="ai",
        page=None if manual or item is None else item.page,
        bbox=None if manual or item is None else item.box_2d,
    )


def is_unreadable(parsed: BaseModel, doc_type: str) -> bool:
    data = parsed.model_dump()
    if any(not p["readable"] for p in data.get("pages", [])):
        return True
    required = [f for f in HEADER[doc_type] if f.required]
    nulls = sum(1 for f in required if not (data.get(f.key) or {}).get("value"))
    return nulls / max(1, len(required)) >= UNREADABLE_NULL_SHARE


def store_result(db: Session, doc: Document, result: gemini.ExtractionResult, attempt: int) -> None:
    """Replace the document's fields with this extraction. Shared by the worker and the seed."""
    shipment = db.get(Shipment, doc.shipment_id)
    assert shipment is not None
    parsed = result.parsed
    db.add(
        ExtractionRun(
            document_id=doc.id,
            model=result.model,
            prompt_version=gemini.PROMPT_VERSION,
            attempt=attempt,
            status="ok",
            raw_response=result.raw,
            latency_ms=result.latency_ms,
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
        )
    )
    manual = is_unreadable(parsed, doc.doc_type)
    supplier_item = getattr(parsed, "supplier_country", None)
    country = (shipment.supplier.country if shipment.supplier else None) or (
        supplier_item.value if supplier_item else None
    )
    db.execute(delete(FieldRow).where(FieldRow.document_id == doc.id))
    rows = [
        _field(doc, fd, getattr(parsed, fd.key), None, country, manual)
        for fd in HEADER[doc.doc_type]
    ]
    line_defs = LINES[doc.doc_type]
    if line_defs:
        lines = [] if manual else list(getattr(parsed, "lines", []))
        for i, line in enumerate(lines or [None]):  # manual entry starts with one empty row
            rows.extend(
                _field(
                    doc,
                    fd,
                    getattr(line, fd.key) if line else None,
                    i,
                    country,
                    manual or line is None,
                )
                for fd in line_defs
            )
    db.add_all(rows)
    if not manual:
        for r in rows:
            if r.confidence is not None:
                telemetry.field_confidence.record(r.confidence, {"doc_type": doc.doc_type})
    detected = parsed.detected_doc_type  # type: ignore[attr-defined]
    doc.detected_type = detected if detected != "other" else None
    doc.extraction_status = "manual" if manual else "done"
    doc.error = "This document is too hard to read. Enter its fields by hand." if manual else None
    db.flush()
    db.expire(doc, ["fields"])
    recompute_status(db, shipment)


def record_failure(db: Session, doc: Document, error: str, attempt: int, final: bool) -> None:
    db.add(
        ExtractionRun(
            document_id=doc.id,
            model="-",
            prompt_version=gemini.PROMPT_VERSION,
            attempt=attempt,
            status="error",
            error=error[:2000],
        )
    )
    if final:
        doc.extraction_status = "failed"
        doc.error = "The AI couldn't read this document. Retry, or enter the fields by hand."
        shipment = db.get(Shipment, doc.shipment_id)
        assert shipment is not None
        recompute_status(db, shipment)


def process(db: Session, doc: Document, attempt: int) -> None:
    doc.extraction_status = "running"
    db.commit()
    data = get_storage().get(doc.file_key)
    started = datetime.now(UTC)
    result = gemini.extract(data, doc.mime, doc.doc_type)
    log.info(
        "extracted doc=%s model=%s in %sms (started %s)",
        doc.id,
        result.model,
        result.latency_ms,
        started.isoformat(),
    )
    # Someone may have switched to manual entry or replaced the file during the call.
    db.refresh(doc, with_for_update=True)
    if doc.extraction_status != "running" or doc.superseded_at is not None:
        log.info("doc=%s changed during extraction; discarding the result", doc.id)
        return
    store_result(db, doc, result, attempt)
