"""Field review: confirm, edit, optimistic locking, line items, history and who may do what."""

from sqlalchemy import select, update

from app.models import AuditLog, Shipment
from tests.conftest import EXEC, EXEC2, MANAGER, login
from tests.helpers import fake_result, run_next_job, shipment_id, upload


def extracted_invoice(client, db, fake_gemini, overrides=None) -> tuple[int, int, dict]:
    """Upload SHP-24812's invoice as Meera, extract it, return (shipment, document, fields)."""
    _, behaviour = fake_gemini
    behaviour["invoice"] = fake_result("invoice", overrides=overrides)
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    doc_id = upload(c, sid, "invoice").json()["id"]
    run_next_job()
    return sid, doc_id, header_fields(c, doc_id)


def header_fields(c, doc_id: int) -> dict:
    fields = c.get(f"/api/documents/{doc_id}").json()["fields"]
    return {f["key"]: f for f in fields if f["line_index"] is None}


def patch(c, f: dict, **body):
    return c.patch(f"/api/fields/{f['id']}", json={"version": f["version"], **body})


def test_confirming_a_low_confidence_field_clears_its_flag(client, db, fake_gemini) -> None:
    sid, _, fields = extracted_invoice(
        client, db, fake_gemini, {"invoice_total": ("7,650.00", 0.55)}
    )
    assert fields["invoice_total"]["flag"] == "low_confidence"

    r = patch(client, fields["invoice_total"], action="confirm")
    assert r.status_code == 200, r.text
    out = r.json()
    f = out["fields"][0]
    assert f["status"] == "confirmed" and f["flag"] is None and f["value"] == "7,650.00"
    assert f["version"] == fields["invoice_total"]["version"] + 1
    assert out["shipment_open_flags"] == 0 and out["document_flag_count"] == 0
    assert client.get(f"/api/shipments/{sid}").json()["open_flags"] == 0


def test_editing_normalises_keeps_the_ai_value_and_audits(client, db, fake_gemini) -> None:
    _, _, fields = extracted_invoice(client, db, fake_gemini, {"incoterm": ("CIFF", 0.99)})
    assert fields["incoterm"]["flag"] == "low_confidence"

    r = patch(client, fields["incoterm"], value=" cif ")
    f = r.json()["fields"][0]
    assert f["value"] == "cif" and f["normalized"] == "CIF"
    assert f["status"] == "edited" and f["ai_value"] == "CIFF" and f["flag"] is None
    assert f["validator_errors"] == []

    row = db.scalar(select(AuditLog).where(AuditLog.entity == "field", AuditLog.action == "edited"))
    assert row is not None and row.entity_id == f["id"]
    assert row.before["value"] == "CIFF" and row.after["value"] == "cif"


def test_typing_back_the_ai_value_counts_as_confirmed(client, db, fake_gemini) -> None:
    _, _, fields = extracted_invoice(client, db, fake_gemini, {"invoice_total": ("7,650.00", 0.5)})
    f = patch(client, fields["invoice_total"], value="7,650.00").json()["fields"][0]
    assert f["status"] == "confirmed"


def test_values_are_parsed_with_the_suppliers_number_format(client, db, fake_gemini) -> None:
    _, _, fields = extracted_invoice(client, db, fake_gemini)  # SHP-24812's supplier is Swedish
    f = patch(client, fields["invoice_total"], value="7 650,00").json()["fields"][0]
    assert f["normalized"] == "7650.00"


def test_unparseable_and_empty_required_values_are_rejected(client, db, fake_gemini) -> None:
    _, _, fields = extracted_invoice(client, db, fake_gemini)
    r = patch(client, fields["invoice_total"], value="seven thousand")
    assert r.status_code == 422 and "valid" in r.json()["detail"]
    r = patch(client, fields["invoice_total"], value="   ")
    assert r.status_code == 422 and "required" in r.json()["detail"]
    r = patch(client, fields["invoice_total"], value="1" * 501)
    assert r.status_code == 422
    # Nothing was written, so the original version still works.
    assert patch(client, fields["invoice_total"], action="confirm").status_code == 200


def test_confirm_cannot_carry_a_value(client, db, fake_gemini) -> None:
    _, _, fields = extracted_invoice(client, db, fake_gemini)
    r = patch(client, fields["invoice_total"], action="confirm", value="1")
    assert r.status_code == 422


def test_second_of_two_saves_on_the_same_version_gets_409(client, db, fake_gemini) -> None:
    _, _, fields = extracted_invoice(client, db, fake_gemini)
    stale = fields["invoice_total"]
    assert patch(client, stale, value="7,700.00").status_code == 200

    r = patch(client, stale, value="9,999.00")
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["field"]["value"] == "7,700.00"  # the winner's value, for the screen to show
    assert detail["field"]["version"] == stale["version"] + 1
    edits = db.scalars(select(AuditLog).where(AuditLog.action == "edited")).all()
    assert len(edits) == 1


def test_edits_on_other_peoples_and_exported_shipments_are_refused(client, db, fake_gemini) -> None:
    sid, _, fields = extracted_invoice(client, db, fake_gemini)
    client.post("/api/auth/logout")
    other = login(client, EXEC2)  # SHP-24812 belongs to Meera
    assert patch(other, fields["invoice_total"], action="confirm").status_code == 404
    assert other.get(f"/api/fields/{fields['invoice_total']['id']}/history").status_code == 404
    other.post("/api/auth/logout")

    db.execute(update(Shipment).where(Shipment.id == sid).values(status="exported"))
    db.commit()
    c = login(client, EXEC)
    r = patch(c, fields["invoice_total"], action="confirm")
    assert r.status_code == 409 and "reopen" in r.json()["detail"]


def test_manager_can_correct_any_shipment(client, db, fake_gemini) -> None:
    _, _, fields = extracted_invoice(client, db, fake_gemini)
    client.post("/api/auth/logout")
    m = login(client, MANAGER)
    assert patch(m, fields["invoice_total"], value="7,651.00").status_code == 200


def test_fields_of_a_replaced_document_are_read_only(client, db, fake_gemini) -> None:
    sid, _, fields = extracted_invoice(client, db, fake_gemini)
    upload(client, sid, "invoice")  # supersedes the first upload
    r = patch(client, fields["invoice_total"], action="confirm")
    assert r.status_code == 409 and "newer upload" in r.json()["detail"]


def test_manual_entry_fills_fields_and_clears_missing_flags(client, db, fake_gemini) -> None:
    _, behaviour = fake_gemini
    behaviour["bill_of_lading"] = fake_result("bill_of_lading", unreadable=True)
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    doc_id = upload(c, sid, "bill_of_lading").json()["id"]
    run_next_job()
    fields = header_fields(c, doc_id)
    f = patch(c, fields["bl_number"], value="NRDU-BL-9921").json()["fields"][0]
    assert f["status"] == "manual" and f["flag"] is None
    # Confirming an empty field makes no sense; the reviewer has to type it.
    r = patch(c, fields["vessel"], action="confirm")
    assert r.status_code == 422


def test_line_items_can_be_added_and_removed_but_not_the_last(client, db, fake_gemini) -> None:
    sid, doc_id, _ = extracted_invoice(client, db, fake_gemini)
    doc = client.get(f"/api/documents/{doc_id}").json()
    lines_before = {f["line_index"] for f in doc["fields"] if f["line_index"] is not None}

    added = client.post(f"/api/documents/{doc_id}/lines").json()
    new_index = max(lines_before) + 1
    assert {f["line_index"] for f in added["fields"]} == {new_index}
    assert all(f["value"] is None and f["status"] == "manual" for f in added["fields"])
    # An empty new line has empty required fields, so the shipment needs review again.
    assert added["shipment_status"] == "needs_review" and added["shipment_open_flags"] > 0

    r = client.delete(f"/api/documents/{doc_id}/lines/{new_index}")
    assert r.status_code == 200 and r.json()["shipment_open_flags"] == 0
    assert client.delete(f"/api/documents/{doc_id}/lines/{new_index}").status_code == 404
    for i in sorted(lines_before)[:-1]:
        assert client.delete(f"/api/documents/{doc_id}/lines/{i}").status_code == 200
    last = client.delete(f"/api/documents/{doc_id}/lines/{max(lines_before)}")
    assert last.status_code == 409
    actions = db.scalars(select(AuditLog.action).where(AuditLog.entity == "document")).all()
    assert actions.count("line_added") == 1 and actions.count("line_removed") == len(lines_before)


def test_bill_of_lading_has_no_line_items(client, db, fake_gemini) -> None:
    c = login(client, EXEC)
    doc_id = upload(c, shipment_id(db, "SHP-24812"), "bill_of_lading").json()["id"]
    run_next_job()
    assert c.post(f"/api/documents/{doc_id}/lines").status_code == 422


def test_cannot_edit_while_the_document_is_being_read(client, db) -> None:
    c = login(client, EXEC)
    doc_id = upload(c, shipment_id(db, "SHP-24812"), "invoice").json()["id"]
    assert c.post(f"/api/documents/{doc_id}/lines").status_code == 409


def test_history_lists_edits_newest_first_with_names(client, db, fake_gemini) -> None:
    _, _, fields = extracted_invoice(client, db, fake_gemini, {"invoice_total": ("7,650.00", 0.5)})
    f1 = patch(client, fields["invoice_total"], value="7,700.00").json()["fields"][0]
    patch(client, f1, value="7,650.00")
    hist = client.get(f"/api/fields/{f1['id']}/history").json()
    assert [h["action"] for h in hist] == ["edited", "edited"]
    assert hist[0]["after"]["value"] == "7,650.00" and hist[1]["before"]["value"] == "7,650.00"
    assert hist[0]["actor"] == "Meera Iyer"
