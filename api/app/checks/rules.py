"""Cross-check rules X1–X10 (PRD §8.3, TDD §5.4).

Each rule is a pure function of a ShipmentView: no database, no AI, Decimal arithmetic. A rule
with a missing input returns `not_checkable`, which is a flag, never a pass.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from rapidfuzz import fuzz

from app.extraction.normalize import normalize_party

DOC_NAME = {"invoice": "invoice", "packing_list": "packing list", "bill_of_lading": "B/L"}
MONEY_TOL = Decimal("0.01")  # PRD A8
WEIGHT_TOL_SHARE = Decimal("0.005")  # PRD A9: ±0.5% or 5 kg, whichever is smaller
WEIGHT_TOL_KG = Decimal("5")
PARTY_MATCH = 85  # PRD A10, rapidfuzz scores are 0–100
LINE_MATCH = 85  # TDD §5.4

Status = Literal["pass", "fail", "not_checkable"]


@dataclass(frozen=True)
class Val:
    """One extracted field as the rules see it."""

    field_id: int
    doc: str
    key: str
    line: int | None  # 1-based position in the document's line list, None for header fields
    label: str
    raw: str | None
    norm: Any


@dataclass
class DocView:
    header: dict[str, Val]
    lines: list[dict[str, Val]]


@dataclass
class ShipmentView:
    docs: dict[str, DocView]  # only documents whose fields can be read (done or manual)
    importer_name: str | None = None


@dataclass(frozen=True)
class Shown:
    """A value the UI puts in the comparison row."""

    label: str
    doc: str | None
    value: str
    field_id: int | None = None


@dataclass
class Outcome:
    status: Status
    message: str
    shown: list[Shown] = field(default_factory=list)
    inputs: list[Val] = field(default_factory=list)  # every field read; edits to these rerun it
    missing: list[str] = field(default_factory=list)
    tolerance: str | None = None


@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    run: Callable[[ShipmentView], Outcome]


# ---------- helpers ----------


def dec(v: Val | None) -> Decimal | None:
    if v is None or v.norm is None or isinstance(v.norm, list):
        return None
    try:
        return Decimal(str(v.norm))
    except InvalidOperation:
        return None


def num(v: Val) -> Decimal:
    """For values `need` has already checked are present."""
    return dec(v) or Decimal(0)


def fmt(d: Decimal) -> str:
    return f"{d:,.0f}" if d == d.to_integral_value() else f"{d:,.2f}"


def money(d: Decimal) -> str:
    return f"{d:,.2f}"


def where(v: Val) -> str:
    return f"{DOC_NAME[v.doc]} line {v.line}" if v.line else DOC_NAME[v.doc]


MONEY_KEYS = {"invoice_total", "amount", "unit_price"}


def shown(v: Val, value: str | None = None) -> Shown:
    d = dec(v)
    if value is not None:
        text = value
    elif d is not None:
        text = money(d) if v.key in MONEY_KEYS else fmt(d)
    else:
        text = v.raw or ""
    return Shown(f"{v.label} ({where(v)})", v.doc, text, v.field_id)


class Missing(Exception):
    """Raised by `need` and turned into a not_checkable outcome."""

    def __init__(self, what: str, inputs: list[Val]):
        self.what, self.inputs = what, inputs


def doc(view: ShipmentView, doc_type: str) -> DocView:
    d = view.docs.get(doc_type)
    if d is None:
        raise Missing(f"no readable {DOC_NAME[doc_type]}", [])
    return d


def need(d: DocView, key: str, doc_type: str, line: dict[str, Val] | None = None) -> Val:
    src = line if line is not None else d.header
    v = src.get(key)
    if v is None or v.norm is None or v.norm == []:
        place = DOC_NAME[doc_type] + (f" line {v.line}" if v and v.line else "")
        label = v.label if v else key.replace("_", " ")
        raise Missing(f"{label} is empty on the {place}", [v] if v else [])
    return v


def weight_tol(ref: Decimal) -> Decimal:
    return min(abs(ref) * WEIGHT_TOL_SHARE, WEIGHT_TOL_KG)


def ident(s: str) -> str:
    """Compare document numbers ignoring case and punctuation: 'zs 2026/1187' = 'ZS-2026-1187'."""
    return re.sub(r"[^0-9A-Z]", "", s.upper())


# ---------- rules ----------


def x1_invoice_total(view: ShipmentView) -> Outcome:
    inv = doc(view, "invoice")
    total = need(inv, "invoice_total", "invoice")
    if not inv.lines:
        raise Missing("the invoice has no line items", [total])
    amounts = [need(inv, "amount", "invoice", ln) for ln in inv.lines]
    s = sum((num(a) for a in amounts), Decimal(0))
    t = num(total)
    ok = abs(t - s) <= MONEY_TOL
    return Outcome(
        "pass" if ok else "fail",
        "Invoice total equals the sum of its lines"
        if ok
        else f"Invoice total {money(t)} ≠ sum of line amounts {money(s)}"
        f" (off by {money(abs(t - s))})",
        [shown(total), Shown("Sum of line amounts", "invoice", money(s))],
        [total, *amounts],
        tolerance="±0.01",
    )


def x2_line_amounts(view: ShipmentView) -> Outcome:
    inv = doc(view, "invoice")
    if not inv.lines:
        raise Missing("the invoice has no line items", [])
    inputs: list[Val] = []
    bad: list[str] = []
    out: list[Shown] = []
    for ln in inv.lines:
        q, p, a = (need(inv, k, "invoice", ln) for k in ("quantity", "unit_price", "amount"))
        inputs += [q, p, a]
        expected = (num(q) * num(p)).quantize(Decimal("0.01"))
        if abs(expected - num(a)) > MONEY_TOL:
            bad.append(
                f"line {a.line}: {fmt(num(q))} × {money(num(p))} = {money(expected)}, "
                f"printed {money(num(a))}"
            )
            calc = Shown(f"Qty × unit price (line {a.line})", "invoice", money(expected))
            out += [shown(a), calc]
    return Outcome(
        "fail" if bad else "pass",
        ("Line amounts don't add up: " + "; ".join(bad))
        if bad
        else "Every line amount equals quantity × unit price",
        out,
        inputs,
        tolerance="±0.01 per line",
    )


def _match_lines(
    inv: list[dict[str, Val]], pl: list[dict[str, Val]]
) -> tuple[list[tuple[int, int]], list[int], list[int]]:
    """Pair invoice and packing-list lines by description, best match first."""
    if len(inv) == 1 and len(pl) == 1:
        return [(0, 0)], [], []  # one item each: the same goods, however it's described
    scores = sorted(
        (
            (
                fuzz.token_set_ratio(
                    normalize_party(i["description"].raw or ""),
                    normalize_party(p["description"].raw or ""),
                ),
                a,
                b,
            )
            for a, i in enumerate(inv)
            for b, p in enumerate(pl)
        ),
        reverse=True,
    )
    used_a: set[int] = set()
    used_b: set[int] = set()
    pairs = []
    for score, a, b in scores:
        if score < LINE_MATCH or a in used_a or b in used_b:
            continue
        pairs.append((a, b))
        used_a.add(a)
        used_b.add(b)
    return (
        sorted(pairs),
        [a for a in range(len(inv)) if a not in used_a],
        [b for b in range(len(pl)) if b not in used_b],
    )


def x3_quantities(view: ShipmentView) -> Outcome:
    inv, pl = doc(view, "invoice"), doc(view, "packing_list")
    if not inv.lines or not pl.lines:
        raise Missing("line items are missing", [])
    inputs: list[Val] = []
    for d, t in ((inv, "invoice"), (pl, "packing_list")):
        for ln in d.lines:
            inputs += [need(d, "description", t, ln), need(d, "quantity", t, ln)]
    pairs, lone_inv, lone_pl = _match_lines(inv.lines, pl.lines)
    problems: list[str] = []
    out: list[Shown] = []
    for a, b in pairs:
        qi, qp = inv.lines[a]["quantity"], pl.lines[b]["quantity"]
        if dec(qi) != dec(qp):
            problems.append(
                f"{inv.lines[a]['description'].raw}: invoice {fmt(num(qi))}, "
                f"packing list {fmt(num(qp))}"
            )
            out += [shown(qi), shown(qp)]
    problems += [f"invoice line {a + 1} has no matching packing-list line" for a in lone_inv]
    problems += [f"packing-list line {b + 1} has no matching invoice line" for b in lone_pl]
    return Outcome(
        "fail" if problems else "pass",
        ("Quantities differ: " + "; ".join(problems))
        if problems
        else f"Quantities match for all {len(pairs)} item{'s' if len(pairs) != 1 else ''}",
        out,
        inputs,
        tolerance="exact",
    )


def x4_packages(view: ShipmentView) -> Outcome:
    pl, bl = doc(view, "packing_list"), doc(view, "bill_of_lading")
    a = need(pl, "total_packages", "packing_list")
    b = need(bl, "total_packages", "bill_of_lading")
    ok = dec(a) == dec(b)
    return Outcome(
        "pass" if ok else "fail",
        "Package counts match"
        if ok
        else f"Packing list says {fmt(num(a))} packages, B/L says {fmt(num(b))}",
        [shown(a), shown(b)],
        [a, b],
        tolerance="exact",
    )


def _weights_agree(vals: list[Val], what: str) -> tuple[bool, str, str]:
    ref = num(vals[0])
    tol = weight_tol(ref)
    worst = max(abs(num(v) - ref) for v in vals[1:])
    tol_text = f"±{fmt(tol)} kg"
    if worst <= tol:
        return True, f"{what} agree within {tol_text}", tol_text
    parts = ", ".join(f"{where(v)} {fmt(num(v))} kg" for v in vals)
    return False, f"{what} differ by up to {fmt(worst)} kg: {parts}", tol_text


def x5_gross_weight(view: ShipmentView) -> Outcome:
    pl, bl = doc(view, "packing_list"), doc(view, "bill_of_lading")
    vals = [
        need(pl, "total_gross_weight_kg", "packing_list"),
        need(bl, "total_gross_weight_kg", "bill_of_lading"),
    ]
    inv = view.docs.get("invoice")
    if inv and (g := inv.header.get("total_gross_weight_kg")) and dec(g) is not None:
        vals.append(g)  # optional on the invoice: compared only when printed
    ok, msg, tol = _weights_agree(vals, "Gross weights")
    return Outcome("pass" if ok else "fail", msg, [shown(v) for v in vals], vals, tolerance=tol)


def x6_net_below_gross(view: ShipmentView) -> Outcome:
    pl = doc(view, "packing_list")
    pairs = [
        (
            need(pl, "total_net_weight_kg", "packing_list"),
            need(pl, "total_gross_weight_kg", "packing_list"),
        )
    ]
    pairs += [
        (
            need(pl, "net_weight_kg", "packing_list", ln),
            need(pl, "gross_weight_kg", "packing_list", ln),
        )
        for ln in pl.lines
    ]
    bad = [(n, g) for n, g in pairs if num(n) > num(g)]
    return Outcome(
        "fail" if bad else "pass",
        "Net weight is above gross weight on "
        + "; ".join(f"{where(n)} ({fmt(num(n))} > {fmt(num(g))} kg)" for n, g in bad)
        if bad
        else "Net weight is at or below gross weight everywhere",
        [s for n, g in bad for s in (shown(n), shown(g))],
        [v for p in pairs for v in p],
    )


def x7_containers(view: ShipmentView) -> Outcome:
    pl, bl = doc(view, "packing_list"), doc(view, "bill_of_lading")
    a = need(pl, "container_numbers", "packing_list")
    b = need(bl, "container_numbers", "bill_of_lading")
    sa, sb = set(a.norm), set(b.norm)
    ok = sa == sb
    diff = []
    if only := sorted(sa - sb):
        diff.append(f"only on the packing list: {', '.join(only)}")
    if only := sorted(sb - sa):
        diff.append(f"only on the B/L: {', '.join(only)}")
    return Outcome(
        "pass" if ok else "fail",
        "Container numbers match" if ok else "Containers differ, " + "; ".join(diff),
        [shown(a, ", ".join(a.norm)), shown(b, ", ".join(b.norm))],
        [a, b],
        tolerance="exact set",
    )


def x8_importer(view: ShipmentView) -> Outcome:
    vals: list[Val] = []
    if (inv := view.docs.get("invoice")) and (v := inv.header.get("buyer_name")) and v.raw:
        vals.append(v)
    if (bl := view.docs.get("bill_of_lading")) and (v := bl.header.get("consignee_name")) and v.raw:
        vals.append(v)
    names: list[tuple[str, str]] = [(where(v), v.raw or "") for v in vals]
    if view.importer_name:
        names.insert(0, ("shipment record", view.importer_name))
    if len(names) < 2:
        raise Missing("the importer isn't named on two sources", vals)
    ref = normalize_party(names[0][1])
    scores = [(src, n, fuzz.token_set_ratio(ref, normalize_party(n))) for src, n in names[1:]]
    bad = [(src, n) for src, n, s in scores if s < PARTY_MATCH]
    out = (
        [Shown("Importer (shipment record)", None, view.importer_name)]
        if view.importer_name
        else []
    )
    out += [shown(v) for v in vals]
    return Outcome(
        "fail" if bad else "pass",
        f"The importer is {names[0][1]} on the {names[0][0]}, but "
        + "; ".join(f"{n} on the {src}" for src, n in bad)
        if bad
        else "The importer is the same party everywhere",
        out,
        vals,
        tolerance="name similarity ≥ 85%",
    )


def x9_invoice_reference(view: ShipmentView) -> Outcome:
    inv, pl = doc(view, "invoice"), doc(view, "packing_list")
    a = need(inv, "invoice_number", "invoice")
    b = need(pl, "invoice_reference", "packing_list")
    ok = ident(str(a.norm)) == ident(str(b.norm))
    return Outcome(
        "pass" if ok else "fail",
        "The packing list quotes the right invoice number"
        if ok
        else f"Packing list quotes invoice {b.raw}, but the invoice is numbered {a.raw}",
        [shown(a), shown(b)],
        [a, b],
        tolerance="exact, ignoring case and punctuation",
    )


def x10_line_gross(view: ShipmentView) -> Outcome:
    pl = doc(view, "packing_list")
    total = need(pl, "total_gross_weight_kg", "packing_list")
    if not pl.lines:
        raise Missing("the packing list has no line items", [total])
    lines = [need(pl, "gross_weight_kg", "packing_list", ln) for ln in pl.lines]
    s = sum((num(v) for v in lines), Decimal(0))
    t = num(total)
    tol = weight_tol(t)
    ok = abs(s - t) <= tol
    return Outcome(
        "pass" if ok else "fail",
        "Line gross weights add up to the total"
        if ok
        else f"Line gross weights add up to {fmt(s)} kg, the total says {fmt(t)} kg",
        [shown(total), Shown("Sum of line gross weights", "packing_list", fmt(s))],
        [total, *lines],
        tolerance=f"±{fmt(tol)} kg",
    )


RULES: tuple[Rule, ...] = (
    Rule("X1", "Invoice total = sum of lines", x1_invoice_total),
    Rule("X2", "Line amount = quantity × unit price", x2_line_amounts),
    Rule("X3", "Quantities match, invoice ↔ packing list", x3_quantities),
    Rule("X4", "Package count, packing list ↔ B/L", x4_packages),
    Rule("X5", "Gross weight across documents", x5_gross_weight),
    Rule("X6", "Net weight ≤ gross weight", x6_net_below_gross),
    Rule("X7", "Container numbers, packing list ↔ B/L", x7_containers),
    Rule("X8", "Same importer on every document", x8_importer),
    Rule("X9", "Packing list quotes the invoice number", x9_invoice_reference),
    Rule("X10", "Line gross weights = total gross weight", x10_line_gross),
)


def evaluate(rule: Rule, view: ShipmentView) -> Outcome:
    try:
        return rule.run(view)
    except Missing as m:
        return Outcome("not_checkable", f"Can't check: {m.what}", inputs=m.inputs, missing=[m.what])
