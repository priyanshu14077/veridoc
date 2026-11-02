"""Cross-check rules X1–X10: pass, fail, edge of tolerance and missing input; then every sample
shipment end to end on the real recorded model output."""

import itertools
import json
import re
from pathlib import Path

import pytest
from sqlalchemy import select

from app.checks.engine import inputs_hash
from app.checks.rules import RULES, DocView, ShipmentView, Val, evaluate
from app.extraction.catalog import field_def
from app.extraction.validators import normalize_and_validate
from app.models import CheckResult, Shipment
from app.seed import seed_documents

_ids = itertools.count(1)
RULE = {r.id: r for r in RULES}


def doc(doc_type: str, header: dict, lines: list[dict] | None = None) -> DocView:
    def val(key: str, raw, line: int | None) -> Val:
        fd = field_def(doc_type, key, line is not None)
        raw = None if raw is None else str(raw)
        norm, _ = normalize_and_validate(fd.kind, raw, "India")
        return Val(next(_ids), doc_type, key, line, fd.label, raw, norm)

    return DocView(
        {k: val(k, v, None) for k, v in header.items()},
        [{k: val(k, v, i + 1) for k, v in ln.items()} for i, ln in enumerate(lines or [])],
    )


def invoice(total="100.00", lines=None, **header) -> DocView:
    lines = (
        lines
        if lines is not None
        else [
            {
                "description": "LED panel",
                "quantity": "10",
                "unit_price": "10.00",
                "amount": "100.00",
            }
        ]
    )
    return doc("invoice", {"invoice_total": total, "invoice_number": "ZS-1", **header}, lines)


def packing(lines=None, **header) -> DocView:
    base = {
        "invoice_reference": "ZS-1",
        "total_packages": "10",
        "total_net_weight_kg": "900",
        "total_gross_weight_kg": "1000",
        "container_numbers": "LTSU8361040",
    }
    lines = lines if lines is not None else [
        {"description": "LED panel", "quantity": "10", "net_weight_kg": "900",
         "gross_weight_kg": "1000"}
    ]  # fmt: skip
    return doc("packing_list", base | header, lines)


def bl(**header) -> DocView:
    base = {
        "total_packages": "10",
        "total_gross_weight_kg": "1000",
        "container_numbers": "LTSU8361040",
        "consignee_name": "Company E Lighting Pvt Ltd",
    }
    return doc("bill_of_lading", base | header)


def run(rule_id: str, **docs: DocView):
    view = ShipmentView(docs=docs, importer_name="Company E Lighting Pvt Ltd")
    return evaluate(RULE[rule_id], view)


def clean() -> dict[str, DocView]:
    return {"invoice": invoice(buyer_name="Company E Lighting Pvt Ltd"), "packing_list": packing(),
            "bill_of_lading": bl()}  # fmt: skip


def test_a_clean_shipment_passes_every_rule() -> None:
    view = ShipmentView(docs=clean(), importer_name="Company E Lighting Pvt Ltd")
    assert {r.id: evaluate(r, view).status for r in RULES} == {r.id: "pass" for r in RULES}


# ---------- X1 / X2: invoice arithmetic ----------


def test_x1_total_must_equal_line_sum_within_a_paisa() -> None:
    assert run("X1", invoice=invoice(total="100.01")).status == "pass"
    o = run("X1", invoice=invoice(total="100.02"))
    assert o.status == "fail" and "100.02" in o.message and "100.00" in o.message


def test_x1_without_the_invoice_or_a_line_amount_is_not_checkable() -> None:
    assert run("X1").status == "not_checkable"
    line = {"description": "LED panel", "quantity": "10", "unit_price": "10.00", "amount": None}
    o = run("X1", invoice=invoice(lines=[line]))
    assert o.status == "not_checkable" and "Amount" in o.message


def test_x2_flags_the_line_whose_amount_is_wrong() -> None:
    lines = [
        {"description": "A", "quantity": "2,400", "unit_price": "6.80", "amount": "16,320.00"},
        {"description": "B", "quantity": "3", "unit_price": "1.50", "amount": "4.00"},
    ]
    o = run("X2", invoice=invoice(total="16324.00", lines=lines))
    assert o.status == "fail" and "line 2" in o.message and "line 1" not in o.message


# ---------- X3: quantities per item ----------


def test_x3_matches_lines_by_description_in_any_order() -> None:
    inv_lines = [
        {"description": "Ball valve DN50 stainless", "quantity": "40"},
        {"description": "Gate valve DN80 cast iron", "quantity": "12"},
    ]
    pl_lines = [
        {"description": "GATE VALVE DN80, CAST IRON", "quantity": "12"},
        {"description": "Ball valve DN50 (stainless)", "quantity": "40"},
    ]
    assert (
        run("X3", invoice=invoice(lines=inv_lines), packing_list=packing(lines=pl_lines)).status
        == "pass"
    )
    pl_lines[0]["quantity"] = "10"
    o = run("X3", invoice=invoice(lines=inv_lines), packing_list=packing(lines=pl_lines))
    assert o.status == "fail" and "Gate valve" in o.message


def test_x3_reports_an_item_missing_from_the_packing_list() -> None:
    inv_lines = [
        {"description": "Ball valve DN50", "quantity": "40"},
        {"description": "Pressure gauge 0-10 bar", "quantity": "5"},
    ]
    pl_lines = [{"description": "Ball valve DN50", "quantity": "40"}]
    o = run("X3", invoice=invoice(lines=inv_lines), packing_list=packing(lines=pl_lines))
    assert o.status == "fail" and "invoice line 2 has no matching" in o.message


# ---------- X4–X7, X10: packing list ↔ B/L ----------


def test_x4_package_counts_must_be_equal() -> None:
    assert run("X4", packing_list=packing(), bill_of_lading=bl()).status == "pass"
    o = run(
        "X4", packing_list=packing(total_packages="320"), bill_of_lading=bl(total_packages="318")
    )
    assert o.status == "fail" and "320" in o.message and "318" in o.message


def test_x4_without_a_bl_is_not_checkable() -> None:
    o = run("X4", packing_list=packing())
    assert o.status == "not_checkable" and "B/L" in o.message


@pytest.mark.parametrize(
    ("pl", "bl_", "status"),
    [
        ("1000", "1005", "pass"),  # 0.5% is 5 kg: right on the limit
        ("1000", "1005.01", "fail"),
        ("200", "201", "pass"),  # 0.5% of 200 = 1 kg is the smaller limit
        ("200", "201.5", "fail"),
        ("3165", "3170", "pass"),  # 5 kg is smaller than 0.5% (15.8 kg)
        ("3165", "3171", "fail"),
    ],
)
def test_x5_weight_tolerance_is_half_a_percent_or_5_kg_whichever_is_smaller(
    pl, bl_, status
) -> None:
    o = run(
        "X5",
        packing_list=packing(total_gross_weight_kg=pl),
        bill_of_lading=bl(total_gross_weight_kg=bl_),
    )
    assert o.status == status


def test_x5_includes_the_invoice_weight_only_when_printed() -> None:
    docs = {"packing_list": packing(total_gross_weight_kg="3165"),
            "bill_of_lading": bl(total_gross_weight_kg="3165")}  # fmt: skip
    assert run("X5", invoice=invoice(), **docs).status == "pass"
    o = run("X5", invoice=invoice(total_gross_weight_kg="3,120.00 KGS"), **docs)
    assert o.status == "fail" and "3,120" in o.message and len(o.shown) == 3


def test_x6_net_above_gross_on_a_line() -> None:
    line = {
        "description": "Carton",
        "quantity": "1",
        "net_weight_kg": "312",
        "gross_weight_kg": "298",
    }
    o = run(
        "X6",
        packing_list=packing(lines=[line], total_net_weight_kg="290", total_gross_weight_kg="298"),
    )
    assert o.status == "fail" and "line 1" in o.message


def test_x7_compares_containers_as_a_set_after_normalising() -> None:
    a = packing(container_numbers="LTSU 836104-0; NRDU1234565")
    assert (
        run(
            "X7", packing_list=a, bill_of_lading=bl(container_numbers="NRDU1234565, LTSU8361040")
        ).status
        == "pass"
    )
    o = run("X7", packing_list=a, bill_of_lading=bl(container_numbers="LTSU8361040"))
    assert o.status == "fail" and "only on the packing list: NRDU1234565" in o.message


def test_x10_line_gross_weights_add_up_to_the_total() -> None:
    lines = [
        {"description": "A", "quantity": "1", "net_weight_kg": "400", "gross_weight_kg": "450"},
        {"description": "B", "quantity": "1", "net_weight_kg": "500", "gross_weight_kg": "550"},
    ]
    assert run("X10", packing_list=packing(lines=lines)).status == "pass"
    lines[1]["gross_weight_kg"] = "560"
    assert run("X10", packing_list=packing(lines=lines)).status == "fail"


# ---------- X8 / X9: parties and references ----------


def test_x8_accepts_spelling_differences_of_the_same_importer() -> None:
    inv = invoice(buyer_name="COMPANY E LIGHTING PRIVATE LIMITED")
    assert (
        run(
            "X8", invoice=inv, bill_of_lading=bl(consignee_name="Company E Lighting Pvt. Ltd.")
        ).status
        == "pass"
    )


def test_x8_catches_a_different_importer() -> None:
    o = run("X8", invoice=invoice(buyer_name="Company F Flow Controls Ltd"), bill_of_lading=bl())
    assert o.status == "fail" and "Company F" in o.message


def test_x9_ignores_case_and_punctuation_but_not_digits() -> None:
    inv = invoice(invoice_number="RE-2026-08812")
    assert (
        run("X9", invoice=inv, packing_list=packing(invoice_reference="re 2026/08812")).status
        == "pass"
    )
    o = run("X9", invoice=inv, packing_list=packing(invoice_reference="RE-2026-08821"))
    assert o.status == "fail" and "RE-2026-08821" in o.message


# ---------- acceptance hash ----------


def test_inputs_hash_changes_only_when_an_input_changes() -> None:
    view = ShipmentView(docs=clean(), importer_name="Company E Lighting Pvt Ltd")
    before = inputs_hash("X5", evaluate(RULE["X5"], view))
    assert inputs_hash("X5", evaluate(RULE["X5"], view)) == before  # rerun, nothing changed
    pl = view.docs["packing_list"]
    g = pl.header["total_gross_weight_kg"]
    pl.header["total_gross_weight_kg"] = Val(
        g.field_id, g.doc, g.key, None, g.label, "1001", "1001.00"
    )
    assert inputs_hash("X5", evaluate(RULE["X5"], view)) != before  # still passes, but re-review


# ---------- every sample shipment, on real recorded model output ----------

EXPECTED = {
    "SHP-24811": {"X5": "fail"},
    "SHP-24812": {},
    "SHP-24813": {"X1": "fail"},
    "SHP-24814": {"X4": "fail"},
    "SHP-24815": {"X7": "fail", "X9": "fail"},
    "SHP-24816": {},
    "SHP-24817": {},
    "SHP-24818": {},
    "SHP-24819": {"X6": "fail"},
    "SHP-24820": {"X4": "not_checkable", "X5": "not_checkable", "X7": "not_checkable"},
    "SHP-24821": {"X4": "not_checkable", "X5": "not_checkable", "X7": "not_checkable"},
    "SHP-24822": {},
}


def test_each_sample_shipment_fails_exactly_its_planted_rules(db) -> None:
    seed_documents(db)
    for ref, expected in EXPECTED.items():
        sid = db.scalar(select(Shipment.id).where(Shipment.ref == ref))
        rows = db.scalars(select(CheckResult).where(CheckResult.shipment_id == sid)).all()
        assert len(rows) == len(RULES), ref
        got = {c.rule_id: c.status for c in rows if c.status != "pass"}
        assert got == expected, ref


def test_planted_faults_in_the_specs_agree_with_this_table() -> None:
    """Keeps EXPECTED honest: every rule named in a sample's planted faults is expected to fire."""
    root = Path(__file__).resolve().parents[2] / "sample-docs"
    for ref, expected in EXPECTED.items():
        faults = json.loads((root / ref / "truth.json").read_text())["_meta"]["faults"]
        named = {r for f in faults for r in re.findall(r"X\d+", f)}
        assert named <= set(expected), (ref, named)
