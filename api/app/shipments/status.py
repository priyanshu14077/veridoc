"""Flags and shipment status (TDD §3). Flags are computed, never stored, so the export gate, the
status chip and the review screen can't disagree."""

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.extraction.catalog import field_def
from app.extraction.confidence import is_low
from app.models import CheckResult, Document, FieldRow, Shipment

FlagKind = Literal[
    "low_confidence",
    "missing_required",
    "check_failed",
    "check_not_checkable",
    "extraction_failed",
    "extraction_pending",
]


@dataclass(frozen=True)
class Flag:
    kind: FlagKind
    document_id: int | None = None
    field_id: int | None = None
    check_id: int | None = None
    message: str = ""


def active_documents(db: Session, shipment_id: int) -> list[Document]:
    return list(
        db.scalars(
            select(Document)
            .where(Document.shipment_id == shipment_id, Document.superseded_at.is_(None))
            .order_by(Document.doc_type)
        )
    )


def field_flag(doc: Document, f: FieldRow) -> Flag | None:
    fd = field_def(doc.doc_type, f.key, f.line_index is not None)
    if fd.required and (f.value is None or not f.value.strip()):
        return Flag("missing_required", doc.id, f.id, message=f"{fd.label} is empty")
    if f.status == "ai" and is_low(f.confidence):
        return Flag(
            "low_confidence", doc.id, f.id, message=f"{fd.label}: low confidence {f.confidence:.2f}"
        )
    return None


def open_flags(db: Session, shipment_id: int) -> list[Flag]:
    flags: list[Flag] = []
    for doc in active_documents(db, shipment_id):
        if doc.extraction_status in ("pending", "running"):
            flags.append(Flag("extraction_pending", doc.id, message="Extraction in progress"))
            continue
        if doc.extraction_status == "failed":
            flags.append(
                Flag("extraction_failed", doc.id, message=doc.error or "Extraction failed")
            )
            continue
        flags.extend(fl for f in doc.fields if (fl := field_flag(doc, f)))
    for c in db.scalars(select(CheckResult).where(CheckResult.shipment_id == shipment_id)):
        if c.status == "pass":
            continue
        # An acceptance counts only while the inputs it was given are unchanged (TDD §5.4).
        if c.accepted_at and c.accepted_hash == c.inputs_hash:
            continue
        kind: FlagKind = "check_failed" if c.status == "fail" else "check_not_checkable"
        flags.append(Flag(kind, check_id=c.id, message=c.message))
    return flags


def recompute_status(db: Session, shipment: Shipment) -> str:
    docs = active_documents(db, shipment.id)
    flags = open_flags(db, shipment.id)
    shipment.open_flag_count = sum(f.kind not in ("extraction_pending",) for f in flags)
    if shipment.status == "exported":
        new = "exported"  # leaving 'exported' needs an explicit manager reopen (day 5)
    elif not docs:
        new = "draft"
    elif any(d.extraction_status in ("pending", "running") for d in docs):
        new = "extracting"
    elif flags:
        new = "needs_review"
    else:
        new = "cleared"
    if new != shipment.status:
        shipment.status = new
    return new
