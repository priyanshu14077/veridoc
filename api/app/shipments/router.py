from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi import status as http
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app import audit
from app.auth.deps import DB, CurrentUser
from app.models import Importer, Shipment, Supplier
from app.privacy import mask_email, mask_name, mask_phone
from app.shipments.access import can_see_contact, get_visible_shipment, visible_to

router = APIRouter(prefix="/shipments", tags=["shipments"])

Status = Literal["draft", "extracting", "needs_review", "cleared", "exported"]


class PartyOut(BaseModel):
    id: int
    name: str


class SupplierOut(PartyOut):
    country: str


class ShipmentRow(BaseModel):
    id: int
    ref: str
    status: Status
    importer: PartyOut
    supplier: SupplierOut | None
    assignee: PartyOut | None
    open_flags: int
    updated_at: datetime


class ShipmentList(BaseModel):
    items: list[ShipmentRow]
    total: int
    page: int
    page_size: int
    status_counts: dict[str, int]


class ContactOut(BaseModel):
    name: str | None
    phone: str | None
    email: str | None
    masked: bool


class ShipmentDetail(ShipmentRow):
    importer_iec: str
    contact: ContactOut
    can_reveal_contact: bool


def _row(s: Shipment) -> ShipmentRow:
    return ShipmentRow(
        id=s.id,
        ref=s.ref,
        status=s.status,  # type: ignore[arg-type]
        importer=PartyOut(id=s.importer.id, name=s.importer.name),
        supplier=SupplierOut(id=s.supplier.id, name=s.supplier.name, country=s.supplier.country)
        if s.supplier
        else None,
        assignee=PartyOut(id=s.assignee.id, name=s.assignee.name) if s.assignee else None,
        open_flags=0,  # computed from fields/checks once extraction lands (TDD §3)
        updated_at=s.updated_at,
    )


@router.get("", response_model=ShipmentList)
def list_shipments(
    user: CurrentUser,
    db: DB,
    status: Annotated[list[Status] | None, Query()] = None,
    assignee: Annotated[str | None, Query(pattern=r"^(me|unassigned|\d+)$")] = None,
    supplier_id: int | None = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ShipmentList:
    base = (
        select(Shipment)
        .join(Importer, Shipment.importer_id == Importer.id)
        .outerjoin(Supplier, Shipment.supplier_id == Supplier.id)
        .where(visible_to(user))
    )
    if assignee == "me":
        base = base.where(Shipment.assignee_id == user.id)
    elif assignee == "unassigned":
        base = base.where(Shipment.assignee_id.is_(None))
    elif assignee:
        base = base.where(Shipment.assignee_id == int(assignee))
    if supplier_id:
        base = base.where(Shipment.supplier_id == supplier_id)
    if q:
        like = f"%{q.strip()}%"
        base = base.where(
            or_(Shipment.ref.ilike(like), Importer.name.ilike(like), Supplier.name.ilike(like))
        )

    # Counts per status ignore the status filter, so the filter chips always show what's there.
    sub = base.with_only_columns(Shipment.status).subquery()
    counts_q = select(sub.c.status, func.count()).group_by(sub.c.status)
    status_counts = {st: n for st, n in db.execute(counts_q)}

    filtered = base.where(Shipment.status.in_(status)) if status else base
    total = db.scalar(select(func.count()).select_from(filtered.subquery())) or 0
    rows = db.scalars(
        filtered.order_by(Shipment.updated_at.desc(), Shipment.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return ShipmentList(
        items=[_row(s) for s in rows],
        total=total,
        page=page,
        page_size=page_size,
        status_counts=status_counts,
    )


def _contact(s: Shipment, reveal: bool) -> ContactOut:
    imp = s.importer
    if reveal:
        return ContactOut(
            name=imp.contact_name, phone=imp.contact_phone, email=imp.contact_email, masked=False
        )
    return ContactOut(
        name=mask_name(imp.contact_name),
        phone=mask_phone(imp.contact_phone),
        email=mask_email(imp.contact_email),
        masked=True,
    )


@router.get("/{shipment_id}", response_model=ShipmentDetail)
def get_shipment(shipment_id: int, user: CurrentUser, db: DB) -> ShipmentDetail:
    s = get_visible_shipment(db, user, shipment_id)
    # Always masked here; the unmasked contact needs an explicit, logged reveal.
    return ShipmentDetail(
        **_row(s).model_dump(),
        importer_iec=s.importer.iec_code,
        contact=_contact(s, False),
        can_reveal_contact=can_see_contact(user, s),
    )


@router.post("/{shipment_id}/contact/reveal", response_model=ContactOut)
def reveal_contact(shipment_id: int, user: CurrentUser, db: DB) -> ContactOut:
    s = get_visible_shipment(db, user, shipment_id)
    if not can_see_contact(user, s):
        raise HTTPException(
            http.HTTP_403_FORBIDDEN, "Only the assigned executive or a manager can see this"
        )
    audit.record(
        db,
        actor_id=user.id,
        entity="importer",
        entity_id=s.importer_id,
        action="contact_revealed",
        after={"shipment_id": s.id},
    )
    db.commit()
    return _contact(s, True)
