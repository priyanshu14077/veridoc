"""Accuracy of the AI in real use (PRD §8.6, F3): of the values the AI read on exported
shipments, the share that people left as they were. Grouped by field or by supplier.

The eval script measures the model against ground truth before go-live (TDD §5.6). This report
measures it against what the team actually filed, so it keeps working on real documents.
"""

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.extraction.catalog import FieldDef, field_def
from app.extraction.confidence import is_low, score
from app.extraction.validators import normalize_and_validate
from app.models import Document, FieldRow, Shipment

Group = Literal["field", "supplier"]
DOC_LABEL = {"invoice": "Invoice", "packing_list": "Packing list", "bill_of_lading": "B/L"}
MAX_EXAMPLES = 3


def _loose(v: Any) -> Any:
    """Case and spacing aren't errors a person would correct: 'COMPANY  B' == 'Company B'."""
    if isinstance(v, str):
        return re.sub(r"\s+", " ", v).strip().casefold()
    return v


def comparable(fd: FieldDef, raw: str | None, country: str | None) -> Any:
    """The value as the cross-checks and the export see it, or the raw text if it won't parse."""
    if raw is None or not raw.strip():
        return None
    norm, errs = normalize_and_validate(fd.kind, raw, country)
    return _loose(raw if "unparseable" in errs or norm is None else norm)


def was_flagged(fd: FieldDef, f: FieldRow, country: str | None) -> bool:
    """Whether the review screen asked a person to look at the AI's value: the confidence it was
    scored at extraction, before anyone touched it."""
    _, errs = normalize_and_validate(fd.kind, f.ai_value, country)
    return is_low(score(f.model_confidence, f.ai_value, fd.required, errs))


@dataclass
class Miss:
    shipment_id: int
    shipment_ref: str
    field: str
    ai_value: str | None
    final_value: str | None
    flagged: bool


@dataclass
class Tally:
    key: str
    label: str
    fields: int = 0
    correct: int = 0
    flagged: int = 0
    missed: int = 0  # corrected, but the flags didn't ask anyone to look
    examples: list[Miss] = field(default_factory=list)

    @property
    def corrected(self) -> int:
        return self.fields - self.correct

    def add(self, ok: bool, flagged: bool, miss: Miss | None) -> None:
        self.fields += 1
        self.correct += ok
        self.flagged += flagged
        if not ok:
            self.missed += not flagged
            if miss and len(self.examples) < MAX_EXAMPLES:
                self.examples.append(miss)


@dataclass
class Report:
    shipments: int = 0
    documents: int = 0
    manual_documents: int = 0
    total: Tally = field(default_factory=lambda: Tally("all", "All fields"))
    rows: list[Tally] = field(default_factory=list)


def field_label(doc_type: str, fd: FieldDef, is_line: bool) -> str:
    return f"{DOC_LABEL[doc_type]}{' line' if is_line else ''} · {fd.label}"


def build(db: Session, group: Group) -> Report:
    shipments = db.scalars(
        select(Shipment).where(Shipment.status == "exported").order_by(Shipment.ref)
    ).all()
    report = Report(shipments=len(shipments))
    if not shipments:
        return report
    by_id = {s.id: s for s in shipments}
    docs = db.scalars(
        select(Document).where(Document.shipment_id.in_(by_id), Document.superseded_at.is_(None))
    ).all()

    tallies: dict[str, Tally] = {}
    for d in docs:
        if d.extraction_status != "done":
            # Typed in by hand after the AI couldn't read it: there's no AI value to score.
            report.manual_documents += d.extraction_status == "manual"
            continue
        report.documents += 1
        s = by_id[d.shipment_id]
        country = s.supplier.country if s.supplier else None
        for f in d.fields:
            is_line = f.line_index is not None
            try:
                fd = field_def(d.doc_type, f.key, is_line)
            except KeyError:
                continue
            ai = comparable(fd, f.ai_value, country)
            final = comparable(fd, f.value, country)
            if ai is None and final is None:
                continue  # not printed, and nobody added it: nothing to score
            ok = ai == final
            flagged = was_flagged(fd, f, country)
            label = field_label(d.doc_type, fd, is_line)
            if group == "field":
                key = f"{d.doc_type}{'.line' if is_line else ''}.{f.key}"
            else:
                key = str(s.supplier_id or 0)
                label = f"{s.supplier.name} ({s.supplier.country})" if s.supplier else "No supplier"
            miss = None
            if not ok:
                where = f" line {f.line_index + 1}" if is_line else ""
                miss = Miss(
                    s.id,
                    s.ref,
                    field_label(d.doc_type, fd, is_line) + where,
                    f.ai_value,
                    f.value,
                    flagged,
                )
            tallies.setdefault(key, Tally(key, label)).add(ok, flagged, miss)
            report.total.add(ok, flagged, None)

    # Worst first: the rows that need attention, then the busiest.
    report.rows = sorted(tallies.values(), key=lambda t: (t.correct / t.fields, -t.fields, t.label))
    return report
