"""Manager reports. The overrides log: every accepted mismatch, every value a person changed from
what the AI read, and every reopen, with who, when and why (PRD F3, D1)."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.deps import DB, require_role
from app.checks.router import TITLES, is_accepted
from app.extraction.catalog import field_def
from app.models import AuditLog, CheckResult, Document, Shipment, User

router = APIRouter(prefix="/reports", tags=["reports"])
Manager = Annotated[User, Depends(require_role("manager"))]
Kind = Literal["accepted", "edited", "reopened"]
DOC = {"invoice": "Invoice", "packing_list": "Packing list", "bill_of_lading": "B/L"}


class OverrideRow(BaseModel):
    id: int
    kind: Kind
    at: datetime
    actor: str | None
    shipment_id: int | None
    shipment_ref: str | None
    subject: str  # "X5 Gross weight agrees" / "Invoice · Gross weight (kg)"
    detail: str  # the mismatch, or "3,120 → 3,165"
    reason: str | None
    still_applies: bool | None  # accepted mismatches only: False once its values changed


class OverridesOut(BaseModel):
    since: date
    items: list[OverrideRow]
    counts: dict[str, int]


@router.get("/overrides", response_model=OverridesOut)
def overrides(
    _: Manager,
    db: DB,
    since: date | None = None,
    kind: Annotated[list[Kind] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> OverridesOut:
    since = since or (datetime.now(UTC) - timedelta(days=30)).date()
    wanted = [
        (AuditLog.entity == "check") & (AuditLog.action == "accepted"),
        (AuditLog.entity == "field") & (AuditLog.action == "edited"),
        (AuditLog.entity == "shipment") & (AuditLog.action == "reopened"),
    ]
    q = select(AuditLog).where(
        AuditLog.created_at >= datetime.combine(since, time.min, UTC),
        wanted[0] | wanted[1] | wanted[2],
    )
    rows = db.scalars(q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())).all()

    names = dict(db.execute(select(User.id, User.name)).all())
    checks = {
        c.id: c
        for c in db.scalars(
            select(CheckResult).where(
                CheckResult.id.in_([r.entity_id for r in rows if r.entity == "check"])
            )
        )
    }
    doc_ids = {r.after["document_id"] for r in rows if r.entity == "field" and r.after}
    docs = {d.id: d for d in db.scalars(select(Document).where(Document.id.in_(doc_ids)))}
    refs = dict(db.execute(select(Shipment.id, Shipment.ref)).all())

    items: list[OverrideRow] = []
    for r in rows:
        after = r.after or {}
        if r.entity == "check":
            c = checks.get(r.entity_id or 0)
            sid = after.get("shipment_id")
            rule = after.get("rule_id", "")
            row = OverrideRow(
                id=r.id,
                kind="accepted",
                at=r.created_at,
                actor=names.get(r.actor_id or 0),
                shipment_id=sid,
                shipment_ref=refs.get(sid),
                subject=f"{rule} {TITLES.get(rule, '')}".strip(),
                detail=after.get("message", ""),
                reason=r.reason,
                # The same person's same reason is still the live acceptance on that check.
                still_applies=bool(
                    c
                    and is_accepted(c)
                    and c.accept_reason == r.reason
                    and c.accepted_by == r.actor_id
                ),
            )
        elif r.entity == "field":
            d = docs.get(after.get("document_id"))
            if d is None:
                continue
            line = after.get("line_index")
            try:
                label = field_def(d.doc_type, after.get("key", ""), line is not None).label
            except KeyError:
                label = after.get("key", "")
            where = f"line {line + 1} · " if line is not None else ""
            old = (r.before or {}).get("value")
            row = OverrideRow(
                id=r.id,
                kind="edited",
                at=r.created_at,
                actor=names.get(r.actor_id or 0),
                shipment_id=d.shipment_id,
                shipment_ref=refs.get(d.shipment_id),
                subject=f"{DOC[d.doc_type]} · {where}{label}",
                detail=f"{old or '(empty)'} → {after.get('value') or '(empty)'}",
                reason=r.reason,
                still_applies=None,
            )
        else:
            row = OverrideRow(
                id=r.id,
                kind="reopened",
                at=r.created_at,
                actor=names.get(r.actor_id or 0),
                shipment_id=r.entity_id,
                shipment_ref=refs.get(r.entity_id or 0),
                subject="Shipment reopened",
                detail=f"Export v{(r.before or {}).get('version')} kept; the next is a new version",
                reason=r.reason,
                still_applies=None,
            )
        items.append(row)

    counts = {k: sum(i.kind == k for i in items) for k in ("accepted", "edited", "reopened")}
    if kind:
        items = [i for i in items if i.kind in kind]
    return OverridesOut(since=since, items=items[:limit], counts=counts)
