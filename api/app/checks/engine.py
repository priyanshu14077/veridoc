"""Build a ShipmentView from the database, run every rule, and store the results.

Rules are pure and take microseconds, so every write reruns all ten rather than tracking which
rules read which field [TDD A22]. A result row is only rewritten when its inputs change, and an
acceptance only counts while its inputs_hash is unchanged (TDD §5.4).
"""

import hashlib
import json
from dataclasses import asdict
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.checks.rules import RULES, DocView, Outcome, ShipmentView, Val, evaluate
from app.extraction.catalog import field_def
from app.models import CheckResult, Document, Shipment

READABLE = ("done", "manual")


def build_view(docs: list[Document], importer_name: str | None) -> ShipmentView:
    view = ShipmentView(docs={}, importer_name=importer_name)
    for d in docs:
        if d.extraction_status not in READABLE:
            continue
        header: dict[str, Val] = {}
        lines: dict[int, dict[str, Val]] = {}
        positions = sorted({f.line_index for f in d.fields if f.line_index is not None})
        for f in d.fields:
            fd = field_def(d.doc_type, f.key, f.line_index is not None)
            pos = None if f.line_index is None else positions.index(f.line_index) + 1
            v = Val(f.id, d.doc_type, f.key, pos, fd.label, f.value, f.normalized)
            if f.line_index is None:
                header[f.key] = v
            else:
                lines.setdefault(f.line_index, {})[f.key] = v
        view.docs[d.doc_type] = DocView(header, [lines[i] for i in positions])
    return view


def inputs_hash(rule_id: str, o: Outcome) -> str:
    payload = {
        "rule": rule_id,
        "status": o.status,
        "inputs": sorted([v.field_id, v.norm] for v in o.inputs),
        "missing": o.missing,
        "shown": [asdict(s) for s in o.shown],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def stored_inputs(o: Outcome) -> dict[str, Any]:
    return {
        "shown": [asdict(s) for s in o.shown],
        "field_ids": sorted({v.field_id for v in o.inputs}),
        "tolerance": o.tolerance,
        "missing": o.missing,
    }


def run_checks(db: Session, shipment: Shipment, docs: list[Document]) -> None:
    """Upsert one check_results row per rule for this shipment."""
    if not docs:
        return  # nothing uploaded yet: the shipment is a draft, not a list of failures
    view = build_view(docs, shipment.importer.name if shipment.importer else None)
    existing = {
        c.rule_id: c
        for c in db.scalars(select(CheckResult).where(CheckResult.shipment_id == shipment.id))
    }
    for rule in RULES:
        o = evaluate(rule, view)
        h = inputs_hash(rule.id, o)
        row = existing.get(rule.id)
        if row is None:
            db.add(
                CheckResult(
                    shipment_id=shipment.id,
                    rule_id=rule.id,
                    status=o.status,
                    inputs=stored_inputs(o),
                    inputs_hash=h,
                    message=o.message,
                )
            )
        elif row.inputs_hash != h:
            row.status, row.inputs, row.inputs_hash, row.message = (
                o.status,
                stored_inputs(o),
                h,
                o.message,
            )
            row.computed_at = func.now()  # type: ignore[assignment]
    db.flush()
