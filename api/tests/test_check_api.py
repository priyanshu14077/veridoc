"""Cross-checks through the API: results on the shipment, conflicts on fields, accepting a
mismatch with a reason, and the acceptance lapsing when its inputs change."""

from sqlalchemy import select, update

from app.models import AuditLog, Shipment
from tests.conftest import EXEC, EXEC2, MANAGER, login
from tests.helpers import fake_result, run_next_job, shipment_id, upload

REF = "SHP-24811"  # the brief's row: invoice 3,120 kg gross vs 3,165 kg on the PL and B/L


def extracted(client, db, fake_gemini, ref: str = REF) -> int:
    _, behaviour = fake_gemini
    for t in ("invoice", "packing_list", "bill_of_lading"):
        behaviour[t] = fake_result(t, ref=ref)
    c = login(client, EXEC)
    sid = shipment_id(db, ref)
    for t in ("invoice", "packing_list", "bill_of_lading"):
        upload(c, sid, t, ref=ref)
    for _ in range(3):
        run_next_job()
    return sid


def checks(c, sid: int) -> dict:
    return {x["rule_id"]: x for x in c.get(f"/api/shipments/{sid}").json()["checks"]}


def invoice_field(c, sid: int, key: str) -> dict:
    detail = c.get(f"/api/shipments/{sid}").json()
    inv = next(d for d in detail["documents"] if d["doc_type"] == "invoice")
    fields = c.get(f"/api/documents/{inv['id']}").json()["fields"]
    return next(f for f in fields if f["key"] == key and f["line_index"] is None)


def test_weight_mismatch_is_reported_on_the_shipment_and_on_the_field(
    client, db, fake_gemini
) -> None:
    sid = extracted(client, db, fake_gemini)
    detail = client.get(f"/api/shipments/{sid}").json()
    assert detail["status"] == "needs_review"
    assert [f["kind"] for f in detail["flags"]] == ["check_failed"]
    x5 = checks(client, sid)["X5"]
    assert x5["status"] == "fail" and "45 kg" in x5["message"]
    assert [s["value"] for s in x5["shown"]] == ["3,165", "3,165", "3,120"]
    assert {c["status"] for c in checks(client, sid).values()} == {"pass", "fail"}

    gross = invoice_field(client, sid, "total_gross_weight_kg")
    assert [c["rule_id"] for c in gross["conflicts"]] == ["X5"]
    assert invoice_field(client, sid, "invoice_total")["conflicts"] == []


def test_correcting_the_value_clears_the_conflict(client, db, fake_gemini) -> None:
    sid = extracted(client, db, fake_gemini)
    gross = invoice_field(client, sid, "total_gross_weight_kg")
    r = client.patch(
        f"/api/fields/{gross['id']}", json={"version": gross["version"], "value": "3,165.00"}
    )
    assert r.status_code == 200
    assert r.json()["shipment_status"] == "cleared" and r.json()["fields"][0]["conflicts"] == []
    assert checks(client, sid)["X5"]["status"] == "pass"


def test_accepting_needs_a_reason_and_is_audited(client, db, fake_gemini) -> None:
    sid = extracted(client, db, fake_gemini)
    x5 = checks(client, sid)["X5"]
    r = client.post(f"/api/checks/{x5['id']}/accept", json={"reason": "  too short "})
    assert r.status_code == 422

    reason = "Supplier confirmed by email: invoice weight excludes pallets"
    r = client.post(f"/api/checks/{x5['id']}/accept", json={"reason": reason})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["accepted"] and out["accept_reason"] == reason and out["accepted_by"] == "Meera Iyer"
    detail = client.get(f"/api/shipments/{sid}").json()
    assert detail["status"] == "cleared" and detail["flags"] == []
    assert invoice_field(client, sid, "total_gross_weight_kg")["conflicts"] == []

    row = db.scalar(select(AuditLog).where(AuditLog.entity == "check"))
    assert row is not None and row.action == "accepted" and row.reason == reason


def test_acceptance_lapses_when_an_input_changes(client, db, fake_gemini) -> None:
    sid = extracted(client, db, fake_gemini)
    x5 = checks(client, sid)["X5"]
    client.post(f"/api/checks/{x5['id']}/accept", json={"reason": "Pallet weight not on invoice"})
    assert client.get(f"/api/shipments/{sid}").json()["status"] == "cleared"

    # Someone changes the invoice weight to a new value that nobody accepted.
    gross = invoice_field(client, sid, "total_gross_weight_kg")
    client.patch(f"/api/fields/{gross['id']}", json={"version": gross["version"], "value": "3,100"})
    after = checks(client, sid)["X5"]
    assert after["status"] == "fail" and not after["accepted"] and after["accept_reason"] is None
    assert client.get(f"/api/shipments/{sid}").json()["status"] == "needs_review"


def test_accept_is_refused_for_passing_checks_other_people_and_exported_shipments(
    client, db, fake_gemini
) -> None:
    sid = extracted(client, db, fake_gemini)
    all_checks = checks(client, sid)
    reason = {"reason": "a reason that is long enough"}
    assert (
        client.post(f"/api/checks/{all_checks['X1']['id']}/accept", json=reason).status_code == 409
    )

    client.post("/api/auth/logout")
    other = login(client, EXEC2)
    assert (
        other.post(f"/api/checks/{all_checks['X5']['id']}/accept", json=reason).status_code == 404
    )
    other.post("/api/auth/logout")

    db.execute(update(Shipment).where(Shipment.id == sid).values(status="exported"))
    db.commit()
    m = login(client, MANAGER)
    assert m.post(f"/api/checks/{all_checks['X5']['id']}/accept", json=reason).status_code == 409


def test_missing_bill_of_lading_makes_its_checks_not_checkable(client, db, fake_gemini) -> None:
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    for t in ("invoice", "packing_list"):
        upload(c, sid, t)
        run_next_job()
    got = {k: v["status"] for k, v in checks(c, sid).items() if v["status"] != "pass"}
    assert got == {"X4": "not_checkable", "X5": "not_checkable", "X7": "not_checkable"}
    assert c.get(f"/api/shipments/{sid}").json()["status"] == "needs_review"


def test_no_checks_before_any_upload(client, db) -> None:
    c = login(client, EXEC)
    detail = c.get(f"/api/shipments/{shipment_id(db, 'SHP-24812')}").json()
    assert detail["checks"] == [] and detail["status"] == "draft"
