"""Cross-check results and accepting a mismatch with a reason (PRD §8.4)."""

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException
from fastapi import status as http
from pydantic import BaseModel, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.auth.deps import DB, CurrentUser
from app.checks.rules import RULES
from app.models import CheckResult, User
from app.shipments.access import get_visible_shipment
from app.shipments.status import recompute_status

router = APIRouter(tags=["checks"])
TITLES = {r.id: r.title for r in RULES}
ORDER = {r.id: i for i, r in enumerate(RULES)}


class CheckOut(BaseModel):
    id: int
    rule_id: str
    title: str
    status: Literal["pass", "fail", "not_checkable"]
    message: str
    shown: list[dict[str, Any]]
    field_ids: list[int]
    tolerance: str | None
    accepted: bool  # an acceptance that still matches the current inputs
    accept_reason: str | None
    accepted_by: str | None
    accepted_at: datetime | None


class AcceptIn(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=500)]


def is_accepted(c: CheckResult) -> bool:
    return c.status != "pass" and c.accepted_at is not None and c.accepted_hash == c.inputs_hash


def check_out(c: CheckResult, names: dict[int, str]) -> CheckOut:
    accepted = is_accepted(c)
    return CheckOut(
        id=c.id,
        rule_id=c.rule_id,
        title=TITLES.get(c.rule_id, c.rule_id),
        status=c.status,  # type: ignore[arg-type]
        message=c.message,
        shown=c.inputs.get("shown", []),
        field_ids=c.inputs.get("field_ids", []),
        tolerance=c.inputs.get("tolerance"),
        accepted=accepted,
        # A lapsed acceptance is kept in the audit log, not shown as if it still applied.
        accept_reason=c.accept_reason if accepted else None,
        accepted_by=names.get(c.accepted_by) if accepted and c.accepted_by else None,
        accepted_at=c.accepted_at if accepted else None,
    )


def shipment_checks(db: Session, shipment_id: int) -> list[CheckOut]:
    rows = db.scalars(select(CheckResult).where(CheckResult.shipment_id == shipment_id)).all()
    ids = {c.accepted_by for c in rows if c.accepted_by}
    names: dict[int, str] = {}
    if ids:
        names = dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all())
    return [check_out(c, names) for c in sorted(rows, key=lambda c: ORDER.get(c.rule_id, 99))]


@router.post("/checks/{check_id}/accept", response_model=CheckOut)
def accept_check(check_id: int, body: AcceptIn, user: CurrentUser, db: DB) -> CheckOut:
    c = db.get(CheckResult, check_id)
    if c is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Check not found")
    shipment = get_visible_shipment(db, user, c.shipment_id)
    if shipment.status == "exported":
        raise HTTPException(
            http.HTTP_409_CONFLICT, "This shipment is exported. A manager must reopen it first."
        )
    db.refresh(c, with_for_update=True)
    if c.status == "pass":
        raise HTTPException(http.HTTP_409_CONFLICT, "This check passes; there's nothing to accept.")
    c.accepted_by = user.id
    c.accept_reason = body.reason
    c.accepted_hash = c.inputs_hash  # the acceptance covers exactly these values
    c.accepted_at = datetime.now(UTC)
    audit.record(
        db,
        actor_id=user.id,
        entity="check",
        entity_id=c.id,
        action="accepted",
        after={
            "shipment_id": shipment.id,
            "rule_id": c.rule_id,
            "status": c.status,
            "message": c.message,
            "inputs": c.inputs.get("shown"),
        },
        reason=body.reason,
    )
    recompute_status(db, shipment)
    db.commit()
    db.refresh(c)
    return check_out(c, {user.id: user.name})
