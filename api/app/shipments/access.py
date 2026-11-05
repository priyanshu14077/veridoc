"""One place for 'who may see which shipment'. Every shipment-scoped route goes through here."""

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, or_, select, true
from sqlalchemy.orm import Session

from app.models import Shipment, User


def visible_to(user: User) -> ColumnElement[bool]:
    if user.role == "manager":
        return true()
    # Executives: their own shipments plus the unassigned pool (PRD A2).
    return or_(Shipment.assignee_id == user.id, Shipment.assignee_id.is_(None))


def can_see_contact(user: User, shipment: Shipment) -> bool:
    return user.role == "manager" or shipment.assignee_id == user.id


def get_visible_shipment(db: Session, user: User, shipment_id: int) -> Shipment:
    shipment = db.get(Shipment, shipment_id)
    # 404 rather than 403, so executives can't probe for shipments they aren't allowed to see.
    if shipment is None or not (user.role == "manager" or shipment.assignee_id in (None, user.id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shipment not found")
    return shipment


EXPORTED = "This shipment is exported. A manager must reopen it first."


def lock_shipment(db: Session, shipment: Shipment) -> Shipment:
    """Take the shipment's row lock for the rest of the transaction, then reload it.

    Every write to a shipment's documents, fields, checks or exports goes through this, so an
    export can't race an edit: whichever comes second sees the other's committed result.
    """
    db.execute(select(Shipment.id).where(Shipment.id == shipment.id).with_for_update())
    db.refresh(shipment)
    return shipment


def lock_editable(db: Session, shipment: Shipment) -> Shipment:
    lock_shipment(db, shipment)
    if shipment.status == "exported":
        raise HTTPException(status.HTTP_409_CONFLICT, EXPORTED)
    return shipment
