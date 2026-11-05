"""Accuracy report: the share of AI values people left unchanged on exported shipments, by field
and by supplier, for managers only (PRD §8.6, F3)."""

from sqlalchemy import select

from app.extraction.catalog import field_def
from app.models import Export, Shipment
from app.reports.accuracy import comparable
from app.seed import HISTORY, seed_documents, seed_history
from tests.conftest import MANAGER, login
from tests.test_check_api import invoice_field
from tests.test_export import cleared


def edit(c, sid: int, key: str, value: str) -> None:
    f = invoice_field(c, sid, key)
    r = c.patch(f"/api/fields/{f['id']}", json={"version": f["version"], "value": value})
    assert r.status_code == 200, r.text


def report(client, group: str = "field") -> dict:
    client.post("/api/auth/logout")
    r = login(client, MANAGER).get("/api/reports/accuracy", params={"group": group})
    assert r.status_code == 200, r.text
    return r.json()


def test_values_compare_the_way_the_checks_read_them() -> None:
    weight = field_def("invoice", "total_gross_weight_kg", False)
    assert comparable(weight, "3,165.00 KGS", None) == comparable(weight, "3165", None)
    name = field_def("invoice", "supplier_name", False)
    assert comparable(name, "COMPANY  B", None) == comparable(name, "Company B", None)
    assert comparable(name, "  ", None) is None


def test_only_managers_see_it_and_it_starts_empty(client, db, fake_gemini) -> None:
    cleared(client, db, fake_gemini)  # cleared, but not exported yet
    assert client.get("/api/reports/accuracy").status_code == 403
    out = report(client)
    assert out["shipments"] == 0 and out["rows"] == []
    assert out["total"]["fields"] == 0


def test_corrections_on_exported_shipments_count_against_the_ai(client, db, fake_gemini) -> None:
    sid = cleared(client, db, fake_gemini)
    edit(client, sid, "incoterm_place", "Yantian")  # a real correction
    edit(client, sid, "supplier_name", "COMPANY B LIGHTING TECHNOLOGY CO., LTD.")  # only case
    assert client.post(f"/api/shipments/{sid}/export").status_code == 201

    out = report(client)
    assert out["shipments"] == 1 and out["documents"] == 3
    total = out["total"]
    assert total["corrected"] == 1 and total["correct"] == total["fields"] - 1
    # The AI read it at 0.97, so nothing asked a person to look: a miss the flags didn't catch.
    assert total["missed"] == 1

    worst = out["rows"][0]
    assert worst["key"] == "invoice.incoterm_place"
    assert worst["label"] == "Invoice · Incoterm place"
    assert (worst["fields"], worst["correct"], worst["missed"]) == (1, 0, 1)
    ex = worst["examples"][0]
    assert ex["shipment_ref"] == "SHP-24811"
    assert (ex["ai_value"], ex["final_value"], ex["flagged"]) == ("Shenzhen", "Yantian", False)
    name = next(r for r in out["rows"] if r["key"] == "invoice.supplier_name")
    assert name["corrected"] == 0
    assert any(r["key"] == "invoice.line.hsn" for r in out["rows"])

    by_supplier = report(client, "supplier")
    assert [r["label"] for r in by_supplier["rows"]] == ["Company B (China)"]
    assert by_supplier["rows"][0]["fields"] == total["fields"]


def test_a_reopened_shipment_drops_out_until_it_is_exported_again(client, db, fake_gemini) -> None:
    sid = cleared(client, db, fake_gemini)
    client.post(f"/api/shipments/{sid}/export")
    assert report(client)["shipments"] == 1
    client.post(f"/api/shipments/{sid}/reopen", json={"reason": "Importer sent a revised invoice"})
    assert report(client)["shipments"] == 0


def test_seed_history_files_the_history_shipments_with_their_one_real_correction(
    client, db
) -> None:
    seed_documents(db)
    assert seed_history(db) == len(HISTORY)
    assert seed_history(db) == 0  # idempotent
    refs = db.scalars(
        select(Shipment.ref).join(Export, Export.shipment_id == Shipment.id).order_by(Shipment.ref)
    ).all()
    assert list(refs) == sorted(HISTORY)

    out = report(client)
    assert out["shipments"] == len(HISTORY)
    # The eval's one miss: SHP-24822's packing list marks, read confidently wrong (TDD §5.6).
    worst = out["rows"][0]
    assert worst["key"] == "packing_list.marks" and worst["missed"] == 1
    assert worst["examples"][0]["shipment_ref"] == "SHP-24822"
    assert worst["examples"][0]["final_value"] == "CO-G / BHIWANDI"
    assert out["total"]["corrected"] == 1
