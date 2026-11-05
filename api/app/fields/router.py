"""Field review: confirm, correct, add and remove line items, and the edit history (TDD §4).

Every write takes the field's `version` and fails with 409 if someone saved it first, is
audited in the same transaction, and recomputes the shipment's flags before it returns, so the
screen can apply the response directly.
"""

from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException
from fastapi import status as http
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app import audit
from app.auth.deps import DB, CurrentUser
from app.documents.router import (
    FieldOut,
    conflicts_by_field,
    doc_out,
    field_out,
    get_visible_document,
    read_only_reason,
)
from app.extraction.catalog import LINES, field_def
from app.extraction.confidence import score
from app.extraction.validators import normalize_and_validate
from app.models import AuditLog, Document, FieldRow, Shipment, User
from app.shipments.access import lock_shipment
from app.shipments.status import recompute_status

router = APIRouter(tags=["fields"])

MAX_VALUE_LEN = 500


class FieldPatch(BaseModel):
    version: int
    action: Literal["confirm", "edit"] = "edit"
    value: Annotated[str | None, Field(max_length=MAX_VALUE_LEN)] = None

    @model_validator(mode="after")
    def _confirm_has_no_value(self) -> "FieldPatch":
        if self.action == "confirm" and self.value is not None:
            raise ValueError("confirm keeps the current value; send action 'edit' to change it")
        return self


class ReviewResult(BaseModel):
    """What changed, plus the shipment-level numbers the screen shows next to it."""

    fields: list[FieldOut]
    document_flag_count: int
    shipment_status: str
    shipment_open_flags: int


class HistoryEntry(BaseModel):
    at: datetime
    actor: str | None
    action: str
    before: dict[str, Any] | None
    after: dict[str, Any] | None


def _editable(db: Session, user: User, document_id: int) -> tuple[Document, Shipment]:
    doc, shipment = get_visible_document(db, user, document_id)
    lock_shipment(db, shipment)  # serialise with an export of the same shipment
    if reason := read_only_reason(doc, shipment):
        raise HTTPException(http.HTTP_409_CONFLICT, reason)
    return doc, shipment


def _country(db: Session, doc: Document, shipment: Shipment) -> str | None:
    """Same number/date locale the extraction used: the supplier's country."""
    if shipment.supplier:
        return shipment.supplier.country
    return db.scalar(
        select(FieldRow.value).where(
            FieldRow.document_id == doc.id,
            FieldRow.key == "supplier_country",
            FieldRow.line_index.is_(None),
        )
    )


def _snapshot(f: FieldRow) -> dict[str, Any]:
    return {"value": f.value, "status": f.status, "version": f.version}


def _result(
    db: Session, doc: Document, shipment: Shipment, changed: list[FieldRow]
) -> ReviewResult:
    db.expire(doc, ["fields"])
    recompute_status(db, shipment)
    db.commit()
    db.refresh(shipment)
    conflicts = conflicts_by_field(db, shipment.id)
    return ReviewResult(
        fields=[field_out(doc, f, conflicts) for f in changed],
        document_flag_count=doc_out(doc).flag_count,
        shipment_status=shipment.status,
        shipment_open_flags=shipment.open_flag_count,
    )


@router.patch("/fields/{field_id}", response_model=ReviewResult)
def patch_field(field_id: int, body: FieldPatch, user: CurrentUser, db: DB) -> ReviewResult:
    f = db.get(FieldRow, field_id)
    if f is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Field not found")
    doc, shipment = _editable(db, user, f.document_id)
    fd = field_def(doc.doc_type, f.key, f.line_index is not None)
    before = _snapshot(f)

    if body.action == "confirm":
        if f.value is None or not f.value.strip():
            raise HTTPException(
                http.HTTP_422_UNPROCESSABLE_CONTENT,
                f"{fd.label} is empty. Type the value from the document instead.",
            )
        changes: dict[str, Any] = {"status": "confirmed"}
    else:
        value = (body.value or "").strip() or None
        if value is None and fd.required:
            raise HTTPException(http.HTTP_422_UNPROCESSABLE_CONTENT, f"{fd.label} is required.")
        norm, errs = normalize_and_validate(fd.kind, value, _country(db, doc, shipment))
        if "unparseable" in errs:
            # Cross-checks and the export read the normalised value, so it has to parse.
            raise HTTPException(
                http.HTTP_422_UNPROCESSABLE_CONTENT,
                f"That doesn't look like a valid {fd.kind} for {fd.label}.",
            )
        if f.ai_value is None:
            new_status = "manual"
        elif value == f.ai_value:
            new_status = "confirmed"  # typed back exactly what the AI read
        else:
            new_status = "edited"
        changes = {
            "value": value,
            "normalized": norm,
            "validator_errors": errs,
            "status": new_status,
            # The AI's score no longer describes a value a person typed.
            "confidence": score(1.0, value, fd.required, errs),
        }

    # Compare-and-set on version: of two simultaneous saves, exactly one wins.
    updated = db.execute(
        update(FieldRow)
        .where(FieldRow.id == f.id, FieldRow.version == body.version)
        .values(**changes, version=FieldRow.version + 1, updated_by=user.id, updated_at=func.now())
    )
    if updated.rowcount == 0:  # type: ignore[attr-defined]
        db.rollback()
        db.refresh(f)
        raise HTTPException(
            http.HTTP_409_CONFLICT,
            {
                "message": "Someone else saved this field first. Their value is shown now.",
                "field": field_out(doc, f).model_dump(mode="json"),
            },
        )
    db.refresh(f)
    audit.record(
        db,
        actor_id=user.id,
        entity="field",
        entity_id=f.id,
        action="confirmed" if body.action == "confirm" else "edited",
        before=before,
        after=_snapshot(f) | {"document_id": doc.id, "key": f.key, "line_index": f.line_index},
    )
    return _result(db, doc, shipment, [f])


@router.post("/documents/{document_id}/lines", response_model=ReviewResult)
def add_line(document_id: int, user: CurrentUser, db: DB) -> ReviewResult:
    doc, shipment = _editable(db, user, document_id)
    defs = LINES[doc.doc_type]
    if not defs:
        raise HTTPException(http.HTTP_422_UNPROCESSABLE_CONTENT, "This document has no line items.")
    db.refresh(doc, with_for_update=True)  # two adds at once must not get the same index
    last = db.scalar(select(func.max(FieldRow.line_index)).where(FieldRow.document_id == doc.id))
    index = 0 if last is None else last + 1
    rows = [
        FieldRow(
            document_id=doc.id,
            key=fd.key,
            line_index=index,
            value=None,
            normalized=None,
            ai_value=None,
            model_confidence=None,
            confidence=score(None, None, fd.required, []),
            validator_errors=[],
            status="manual",
            updated_by=user.id,
        )
        for fd in defs
    ]
    db.add_all(rows)
    db.flush()
    audit.record(
        db,
        actor_id=user.id,
        entity="document",
        entity_id=doc.id,
        action="line_added",
        after={"line_index": index},
    )
    return _result(db, doc, shipment, rows)


@router.delete("/documents/{document_id}/lines/{line_index}", response_model=ReviewResult)
def delete_line(document_id: int, line_index: int, user: CurrentUser, db: DB) -> ReviewResult:
    doc, shipment = _editable(db, user, document_id)
    db.refresh(doc, with_for_update=True)
    rows = list(
        db.scalars(
            select(FieldRow).where(
                FieldRow.document_id == doc.id, FieldRow.line_index == line_index
            )
        )
    )
    if not rows:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Line not found")
    remaining = db.scalar(
        select(func.count(func.distinct(FieldRow.line_index))).where(
            FieldRow.document_id == doc.id, FieldRow.line_index.is_not(None)
        )
    )
    if remaining == 1:
        raise HTTPException(
            http.HTTP_409_CONFLICT,
            "A document needs at least one line item. Edit this one instead.",
        )
    audit.record(
        db,
        actor_id=user.id,
        entity="document",
        entity_id=doc.id,
        action="line_removed",
        before={"line_index": line_index, "values": {r.key: r.value for r in rows}},
    )
    db.execute(
        delete(FieldRow).where(FieldRow.document_id == doc.id, FieldRow.line_index == line_index)
    )
    db.flush()
    return _result(db, doc, shipment, [])


@router.get("/fields/{field_id}/history", response_model=list[HistoryEntry])
def field_history(field_id: int, user: CurrentUser, db: DB) -> list[HistoryEntry]:
    f = db.get(FieldRow, field_id)
    if f is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Field not found")
    get_visible_document(db, user, f.document_id)
    rows = db.execute(
        select(AuditLog, User.name)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .where(AuditLog.entity == "field", AuditLog.entity_id == f.id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    ).all()
    return [
        HistoryEntry(at=a.created_at, actor=name, action=a.action, before=a.before, after=a.after)
        for a, name in rows
    ]
