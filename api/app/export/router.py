"""Export gate, CSV export, export history and the manager's reopen (PRD §8.5, F4)."""

import hashlib
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http
from fastapi.responses import Response
from pydantic import BaseModel, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.auth.deps import DB, CurrentUser, require_role
from app.export.layout import COLUMNS, FORMAT, build_rows, to_csv
from app.models import Export, Shipment, User
from app.shipments.access import get_visible_shipment, lock_shipment
from app.shipments.status import Flag, active_documents, open_flags, recompute_status
from app.storage import get_storage

router = APIRouter(tags=["export"])
Manager = Annotated[User, Depends(require_role("manager"))]


class BlockerOut(BaseModel):
    kind: str
    document_id: int | None
    field_id: int | None
    check_id: int | None
    message: str


class ExportOut(BaseModel):
    id: int
    version: int
    format: str
    sha256: str
    row_count: int
    created_by: str
    created_at: datetime
    file_name: str


class PreviewOut(BaseModel):
    status: str
    blockers: list[BlockerOut]
    columns: list[str]
    rows: list[dict[str, str]]


class ReopenIn(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=500)]


class ReopenOut(BaseModel):
    status: Literal["draft", "extracting", "needs_review", "cleared", "exported"]


def file_name(ref: str, version: int) -> str:
    return f"{ref}-v{version}.csv"


def export_out(e: Export, ref: str) -> ExportOut:
    return ExportOut(
        id=e.id,
        version=e.version,
        format=e.format,
        sha256=e.sha256,
        row_count=e.row_count,
        created_by=e.creator.name,
        created_at=e.created_at,
        file_name=file_name(ref, e.version),
    )


def last_version(db: Session, shipment_id: int) -> int | None:
    return db.scalar(select(func.max(Export.version)).where(Export.shipment_id == shipment_id))


def blockers(db: Session, shipment: Shipment) -> list[Flag]:
    """Everything that stops an export. The same open_flags() the status chip reads."""
    if not active_documents(db, shipment.id):
        return [Flag("missing_document", message="Upload the shipment's documents first")]
    return open_flags(db, shipment.id)


def _blocker(f: Flag) -> BlockerOut:
    return BlockerOut(**vars(f))


@router.get("/shipments/{shipment_id}/export/preview", response_model=PreviewOut)
def preview(shipment_id: int, user: CurrentUser, db: DB) -> PreviewOut:
    """The rows the CSV would contain right now, and what still blocks it."""
    s = get_visible_shipment(db, user, shipment_id)
    rows = build_rows(s, active_documents(db, s.id))
    found = [] if s.status == "exported" else [_blocker(f) for f in blockers(db, s)]
    return PreviewOut(status=s.status, blockers=found, columns=list(COLUMNS), rows=rows)


@router.post(
    "/shipments/{shipment_id}/export",
    response_model=ExportOut,
    status_code=http.HTTP_201_CREATED,
)
def export_shipment(shipment_id: int, user: CurrentUser, db: DB) -> ExportOut:
    s = lock_shipment(db, get_visible_shipment(db, user, shipment_id))
    if s.status == "exported":
        raise HTTPException(
            http.HTTP_409_CONFLICT,
            {
                "message": "Already exported. A manager must reopen it to export again.",
                "blockers": [],
            },
        )
    # Recompute inside the lock: the gate reads the same flags the status is derived from.
    recompute_status(db, s)
    found = blockers(db, s)
    if found:
        db.commit()  # keep the refreshed status; nothing else was written
        n = len(found)
        raise HTTPException(
            http.HTTP_409_CONFLICT,
            {
                "message": f"Can't export yet: {n} open item{'s' if n > 1 else ''} to clear.",
                "blockers": [_blocker(f).model_dump() for f in found],
            },
        )

    docs = active_documents(db, s.id)
    rows = build_rows(s, docs)
    data = to_csv(rows)
    version = (last_version(db, s.id) or 0) + 1
    e = Export(
        shipment_id=s.id,
        version=version,
        format=FORMAT,
        file_key=get_storage().put(data, ".csv"),
        sha256=hashlib.sha256(data).hexdigest(),
        row_count=len(rows),
        created_by=user.id,
    )
    db.add(e)
    s.status = "exported"
    db.flush()
    audit.record(
        db,
        actor_id=user.id,
        entity="shipment",
        entity_id=s.id,
        action="exported",
        after={
            "export_id": e.id,
            "version": version,
            "sha256": e.sha256,
            "rows": e.row_count,
            "documents": {d.doc_type: d.sha256 for d in docs},
        },
    )
    db.commit()
    db.refresh(e)
    return export_out(e, s.ref)


@router.get("/shipments/{shipment_id}/exports", response_model=list[ExportOut])
def list_exports(shipment_id: int, user: CurrentUser, db: DB) -> list[ExportOut]:
    s = get_visible_shipment(db, user, shipment_id)
    rows = db.scalars(
        select(Export).where(Export.shipment_id == s.id).order_by(Export.version.desc())
    )
    return [export_out(e, s.ref) for e in rows]


@router.get("/exports/{export_id}/file")
def download_export(export_id: int, user: CurrentUser, db: DB) -> Response:
    e = db.get(Export, export_id)
    if e is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Export not found")
    s = get_visible_shipment(db, user, e.shipment_id)
    return Response(
        get_storage().get(e.file_key),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{file_name(s.ref, e.version)}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/shipments/{shipment_id}/reopen", response_model=ReopenOut)
def reopen(shipment_id: int, body: ReopenIn, user: Manager, db: DB) -> ReopenOut:
    s = lock_shipment(db, get_visible_shipment(db, user, shipment_id))
    if s.status != "exported":
        raise HTTPException(http.HTTP_409_CONFLICT, "Only an exported shipment can be reopened.")
    last = last_version(db, s.id)
    # Earlier exports stay as they are; the next export becomes a new version.
    s.status = "needs_review"
    new = recompute_status(db, s)
    audit.record(
        db,
        actor_id=user.id,
        entity="shipment",
        entity_id=s.id,
        action="reopened",
        before={"status": "exported", "version": last},
        after={"status": new},
        reason=body.reason,
    )
    db.commit()
    return ReopenOut(status=new)  # type: ignore[arg-type]
