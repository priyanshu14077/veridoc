import hashlib
import io
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi import status as http
from fastapi.responses import Response
from pydantic import BaseModel
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, jobs
from app.auth.deps import DB, CurrentUser
from app.checks.router import is_accepted
from app.config import get_settings
from app.extraction.catalog import HEADER, LINES, field_def
from app.extraction.confidence import score
from app.models import CheckResult, Document, FieldRow, Shipment, User
from app.shipments.access import get_visible_shipment
from app.shipments.status import field_flag, recompute_status
from app.storage import get_storage

router = APIRouter(tags=["documents"])

DocTypeIn = Literal["invoice", "packing_list", "bill_of_lading"]
MAGIC = {
    b"%PDF-": ("application/pdf", ".pdf"),
    b"\x89PNG\r\n\x1a\n": ("image/png", ".png"),
    b"\xff\xd8\xff": ("image/jpeg", ".jpg"),
}


class DocumentOut(BaseModel):
    id: int
    doc_type: DocTypeIn
    file_name: str
    mime: str
    size_bytes: int
    page_count: int | None
    extraction_status: Literal["pending", "running", "done", "failed", "manual"]
    detected_type: DocTypeIn | None
    error: str | None
    created_at: datetime
    flag_count: int


class ConflictOut(BaseModel):
    """An open cross-check that reads this field."""

    check_id: int
    rule_id: str
    status: str
    message: str


class FieldOut(BaseModel):
    id: int
    key: str
    label: str
    section: str
    kind: str
    required: bool
    line_index: int | None
    value: str | None
    normalized: object
    ai_value: str | None
    confidence: float
    validator_errors: list[str]
    status: str
    page: int | None
    bbox: list[int] | None
    version: int
    flag: str | None
    conflicts: list[ConflictOut] = []


class DocumentDetail(DocumentOut):
    fields: list[FieldOut]
    shipment_id: int
    read_only_reason: str | None


def read_only_reason(doc: Document, shipment: Shipment) -> str | None:
    """Why fields can't be changed right now, or None. The field routes enforce the same rules."""
    if shipment.status == "exported":
        return "This shipment is exported. A manager must reopen it first."
    if doc.superseded_at is not None:
        return "A newer upload replaced this document."
    if doc.extraction_status not in ("done", "manual"):
        return "Wait for the AI to finish reading this document."
    return None


def sniff(data: bytes) -> tuple[str, str]:
    for magic, info in MAGIC.items():
        if data.startswith(magic):
            return info
    raise HTTPException(
        http.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        "Upload a PDF, PNG or JPG. This file isn't one of those.",
    )


def count_pages(data: bytes, mime: str) -> int:
    if mime != "application/pdf":
        return 1
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise HTTPException(
                http.HTTP_422_UNPROCESSABLE_CONTENT,
                "This PDF is password-protected. Upload an unlocked copy.",
            )
        return len(reader.pages)
    except PdfReadError as e:
        raise HTTPException(
            http.HTTP_422_UNPROCESSABLE_CONTENT, "This PDF is damaged and can't be opened."
        ) from e


def doc_out(doc: Document) -> DocumentOut:
    flags = (
        sum(1 for f in doc.fields if field_flag(doc, f))
        if doc.extraction_status in ("done", "manual")
        else (1 if doc.extraction_status == "failed" else 0)
    )
    return DocumentOut(
        id=doc.id,
        doc_type=doc.doc_type,
        file_name=doc.file_name,
        mime=doc.mime,  # type: ignore[arg-type]
        size_bytes=doc.size_bytes,
        page_count=doc.page_count,
        extraction_status=doc.extraction_status,  # type: ignore[arg-type]
        detected_type=doc.detected_type,
        error=doc.error,  # type: ignore[arg-type]
        created_at=doc.created_at,
        flag_count=flags,
    )


def conflicts_by_field(db: Session, shipment_id: int) -> dict[int, list[ConflictOut]]:
    out: dict[int, list[ConflictOut]] = {}
    for c in db.scalars(select(CheckResult).where(CheckResult.shipment_id == shipment_id)):
        if c.status == "pass" or is_accepted(c):
            continue
        for fid in c.inputs.get("field_ids", []):
            out.setdefault(fid, []).append(
                ConflictOut(check_id=c.id, rule_id=c.rule_id, status=c.status, message=c.message)
            )
    return out


def field_out(
    doc: Document, f: FieldRow, conflicts: dict[int, list[ConflictOut]] | None = None
) -> FieldOut:
    fd = field_def(doc.doc_type, f.key, f.line_index is not None)
    flag = field_flag(doc, f)
    return FieldOut(
        id=f.id,
        key=f.key,
        label=fd.label,
        section=fd.section,
        kind=fd.kind,
        required=fd.required,
        line_index=f.line_index,
        value=f.value,
        normalized=f.normalized,
        ai_value=f.ai_value,
        confidence=f.confidence,
        validator_errors=f.validator_errors,
        status=f.status,
        page=f.page,
        bbox=f.bbox,
        version=f.version,
        flag=flag.kind if flag else None,
        conflicts=(conflicts or {}).get(f.id, []),
    )


def get_visible_document(db: Session, user: User, document_id: int) -> tuple[Document, Shipment]:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Document not found")
    return doc, get_visible_shipment(db, user, doc.shipment_id)


@router.post(
    "/shipments/{shipment_id}/documents",
    response_model=DocumentOut,
    status_code=http.HTTP_202_ACCEPTED,
)
async def upload_document(
    shipment_id: int,
    user: CurrentUser,
    db: DB,
    file: Annotated[UploadFile, File()],
    doc_type: Annotated[DocTypeIn, Form()],
) -> DocumentOut:
    shipment = get_visible_shipment(db, user, shipment_id)
    if shipment.status == "exported":
        raise HTTPException(
            http.HTTP_409_CONFLICT, "This shipment is exported. A manager must reopen it first."
        )
    s = get_settings()
    limit = s.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            http.HTTP_413_CONTENT_TOO_LARGE, f"Files can be up to {s.max_upload_mb} MB."
        )
    if not data:
        raise HTTPException(http.HTTP_422_UNPROCESSABLE_CONTENT, "The file is empty.")
    mime, suffix = sniff(data)
    pages = count_pages(data, mime)
    if pages > s.max_pages:
        raise HTTPException(
            http.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Documents can have up to {s.max_pages} pages; this one has {pages}.",
        )

    key = get_storage().put(data, suffix)
    now = datetime.now(UTC)
    previous = db.scalar(
        select(Document).where(
            Document.shipment_id == shipment.id,
            Document.doc_type == doc_type,
            Document.superseded_at.is_(None),
        )
    )
    if previous:
        previous.superseded_at = now
        db.flush()  # free the one-active-per-type unique index before inserting
    name = (file.filename or f"{doc_type}{suffix}").replace("/", "_")[-120:]
    doc = Document(
        shipment_id=shipment.id,
        doc_type=doc_type,
        file_key=key,
        file_name=name,
        mime=mime,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        page_count=pages,
        uploaded_by=user.id,
    )
    db.add(doc)
    db.flush()
    jobs.enqueue(db, "extract", {"document_id": doc.id})  # same transaction as the row
    audit.record(
        db,
        actor_id=user.id,
        entity="document",
        entity_id=doc.id,
        action="uploaded",
        after={
            "shipment_id": shipment.id,
            "doc_type": doc_type,
            "sha256": doc.sha256,
            "replaces": previous.id if previous else None,
        },
    )
    recompute_status(db, shipment)
    db.commit()
    db.refresh(doc)
    return doc_out(doc)


@router.get("/documents/{document_id}", response_model=DocumentDetail)
def get_document(document_id: int, user: CurrentUser, db: DB) -> DocumentDetail:
    doc, shipment = get_visible_document(db, user, document_id)
    conflicts = conflicts_by_field(db, shipment.id)
    return DocumentDetail(
        **doc_out(doc).model_dump(),
        fields=[field_out(doc, f, conflicts) for f in doc.fields],
        shipment_id=shipment.id,
        read_only_reason=read_only_reason(doc, shipment),
    )


@router.get("/documents/{document_id}/file")
def get_document_file(document_id: int, user: CurrentUser, db: DB) -> Response:
    doc, _ = get_visible_document(db, user, document_id)
    return Response(
        get_storage().get(doc.file_key),
        media_type=doc.mime,
        headers={
            "Content-Disposition": f'inline; filename="doc-{doc.id}{doc.file_key[-4:]}"',
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post(
    "/documents/{document_id}/retry", response_model=DocumentOut, status_code=http.HTTP_202_ACCEPTED
)
def retry_document(document_id: int, user: CurrentUser, db: DB) -> DocumentOut:
    doc, shipment = get_visible_document(db, user, document_id)
    if doc.superseded_at or doc.extraction_status != "failed":
        raise HTTPException(http.HTTP_409_CONFLICT, "Only a failed extraction can be retried.")
    doc.extraction_status, doc.error = "pending", None
    jobs.enqueue(db, "extract", {"document_id": doc.id})
    audit.record(db, actor_id=user.id, entity="document", entity_id=doc.id, action="retried")
    recompute_status(db, shipment)
    db.commit()
    return doc_out(doc)


@router.post("/documents/{document_id}/manual", response_model=DocumentOut)
def enter_manually(document_id: int, user: CurrentUser, db: DB) -> DocumentOut:
    """Give up on the AI for this document: empty fields, image stays beside them."""
    doc, shipment = get_visible_document(db, user, document_id)
    db.refresh(doc, with_for_update=True)  # serialise against the worker's final check
    # Not while the worker is mid-call (its result would land on top). Waiting jobs are cancelled.
    if doc.superseded_at or doc.extraction_status not in ("failed", "pending"):
        raise HTTPException(
            http.HTTP_409_CONFLICT, "Manual entry is for documents the AI couldn't read."
        )
    jobs.cancel_for_document(db, doc.id)
    has_fields = db.scalar(select(func.count()).where(FieldRow.document_id == doc.id))
    if not has_fields:
        defs = [(fd, None) for fd in HEADER[doc.doc_type]]
        defs += [(fd, 0) for fd in LINES[doc.doc_type]]
        db.add_all(
            FieldRow(
                document_id=doc.id,
                key=fd.key,
                line_index=li,
                value=None,
                normalized=None,
                ai_value=None,
                model_confidence=None,
                confidence=score(None, None, fd.required, []),
                validator_errors=[],
                status="ai",
            )
            for fd, li in defs
        )
    doc.extraction_status, doc.error = "manual", None
    audit.record(db, actor_id=user.id, entity="document", entity_id=doc.id, action="manual_entry")
    db.flush()
    db.expire(doc, ["fields"])
    recompute_status(db, shipment)
    db.commit()
    return doc_out(doc)
