"""Upload → job → extraction → fields → flags → status, with Gemini replaced by a fake."""

from sqlalchemy import select, text

from app import jobs
from app.config import get_settings
from app.db import SessionLocal
from app.extraction import gemini
from app.extraction.catalog import HEADER, LINES
from app.extraction.gemini import ExtractionError
from app.models import AuditLog, Document, FieldRow, Shipment
from tests.conftest import EXEC, EXEC2, MANAGER, login
from tests.helpers import SAMPLES, fake_result, run_next_job, shipment_id, upload

# ---------- upload validation ----------


def test_upload_rejects_non_pdf_bytes_even_with_pdf_name(client, db) -> None:
    c = login(client, EXEC)
    r = upload(c, shipment_id(db, "SHP-24811"), "invoice", data=b"hello, not a pdf")
    assert r.status_code == 415


def test_upload_rejects_empty_and_oversized(client, db, monkeypatch) -> None:
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24811")
    assert upload(c, sid, "invoice", data=b"").status_code == 422
    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    assert upload(c, sid, "invoice").status_code == 413


def test_upload_rejects_unknown_doc_type(client, db) -> None:
    c = login(client, EXEC)
    pdf = (SAMPLES / "SHP-24812" / "invoice.pdf").read_bytes()
    r = upload(c, shipment_id(db, "SHP-24811"), "certificate", data=pdf)
    assert r.status_code == 422


def test_cannot_upload_to_someone_elses_shipment(client, db) -> None:
    c = login(client, EXEC)
    assert upload(c, shipment_id(db, "SHP-24813"), "invoice").status_code == 404


def test_upload_queues_job_in_same_transaction_and_audits(client, db) -> None:
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    r = upload(c, sid, "invoice")
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["extraction_status"] == "pending" and body["page_count"] == 1
    assert db.scalar(text("SELECT count(*) FROM jobs WHERE status = 'queued'")) == 1
    assert db.scalar(select(Shipment.status).where(Shipment.id == sid)) == "extracting"
    assert "uploaded" in db.scalars(select(AuditLog.action)).all()


def test_reupload_supersedes_the_previous_document(client, db, fake_gemini) -> None:
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    first = upload(c, sid, "invoice").json()["id"]
    second = upload(c, sid, "invoice").json()["id"]
    docs = c.get(f"/api/shipments/{sid}").json()["documents"]
    assert [d["id"] for d in docs] == [second]
    run_next_job()  # the first document's job is skipped, not extracted
    calls, _ = fake_gemini
    assert calls == []
    with SessionLocal() as s:
        assert s.get(Document, first).superseded_at is not None


def test_file_is_served_only_to_people_who_can_see_the_shipment(client, db) -> None:
    c = login(client, EXEC)
    doc_id = upload(c, shipment_id(db, "SHP-24812"), "invoice").json()["id"]
    r = c.get(f"/api/documents/{doc_id}/file")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert r.headers["x-content-type-options"] == "nosniff"
    c.post("/api/auth/logout")
    assert login(c, EXEC2).get(f"/api/documents/{doc_id}/file").status_code == 404


# ---------- extraction ----------


def test_clean_extraction_with_high_confidence_clears(client, db, fake_gemini) -> None:
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    for t in ("invoice", "packing_list", "bill_of_lading"):
        upload(c, sid, t)
    for _ in range(3):
        run_next_job()
    detail = c.get(f"/api/shipments/{sid}").json()
    assert {d["extraction_status"] for d in detail["documents"]} == {"done"}
    assert detail["flags"] == [] and detail["status"] == "cleared"


def test_fields_are_normalised_using_the_suppliers_number_format(client, db, fake_gemini) -> None:
    _, behaviour = fake_gemini
    behaviour["invoice"] = fake_result("invoice", overrides={"invoice_total": ("7 650,00", 0.98)})
    c = login(client, EXEC)
    doc_id = upload(c, shipment_id(db, "SHP-24812"), "invoice").json()["id"]  # Sweden
    run_next_job()
    fields = {
        f["key"]: f
        for f in c.get(f"/api/documents/{doc_id}").json()["fields"]
        if f["line_index"] is None
    }
    assert fields["invoice_total"]["value"] == "7 650,00"  # printed text kept
    assert fields["invoice_total"]["normalized"] == "7650.00"
    assert fields["invoice_total"]["flag"] is None


def test_low_confidence_and_validator_failures_are_flagged(client, db, fake_gemini) -> None:
    _, behaviour = fake_gemini
    behaviour["invoice"] = fake_result(
        "invoice",
        overrides={
            "invoice_total": ("7,650.00", 0.55),  # model unsure
            "incoterm": ("CIFF", 0.99),  # confident but invalid
        },
    )
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    doc_id = upload(c, sid, "invoice").json()["id"]
    run_next_job()
    flagged = {f["key"]: f for f in c.get(f"/api/documents/{doc_id}").json()["fields"] if f["flag"]}
    assert flagged["invoice_total"]["flag"] == "low_confidence"
    assert flagged["incoterm"]["flag"] == "low_confidence"
    assert flagged["incoterm"]["confidence"] == 0.4
    assert flagged["incoterm"]["validator_errors"] == ["unknown_incoterm"]
    detail = c.get(f"/api/shipments/{sid}").json()
    assert detail["status"] == "needs_review" and detail["open_flags"] == len(detail["flags"])
    # Two field flags; the rest are cross-checks that can't run without the PL and B/L.
    assert len([f for f in detail["flags"] if f["field_id"]]) == 2


def test_unreadable_page_falls_back_to_manual_entry(client, db, fake_gemini) -> None:
    _, behaviour = fake_gemini
    behaviour["bill_of_lading"] = fake_result("bill_of_lading", unreadable=True)
    c = login(client, EXEC)
    doc_id = upload(c, shipment_id(db, "SHP-24812"), "bill_of_lading").json()["id"]
    run_next_job()
    doc = c.get(f"/api/documents/{doc_id}").json()
    assert doc["extraction_status"] == "manual"
    assert all(f["value"] is None for f in doc["fields"])  # AI guesses are not shown
    assert {f["flag"] for f in doc["fields"] if f["required"]} == {"missing_required"}


def test_retryable_errors_back_off_then_fail_then_retry_endpoint(client, db, fake_gemini) -> None:
    _, behaviour = fake_gemini
    behaviour["invoice"] = ExtractionError("HTTP 503", retryable=True)
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    doc_id = upload(c, sid, "invoice").json()["id"]
    for attempt in range(1, jobs.MAX_ATTEMPTS + 1):
        run_next_job()
        with SessionLocal() as s:
            status = s.get(Document, doc_id).extraction_status
            s.execute(text("UPDATE jobs SET run_after = now()"))  # skip the backoff wait
            s.commit()
        assert status == ("failed" if attempt == jobs.MAX_ATTEMPTS else "pending")
    detail = c.get(f"/api/shipments/{sid}").json()
    assert detail["status"] == "needs_review"
    assert [f["kind"] for f in detail["flags"] if f["document_id"]] == ["extraction_failed"]

    behaviour.pop("invoice")
    assert c.post(f"/api/documents/{doc_id}/retry").status_code == 202
    run_next_job()
    assert c.get(f"/api/documents/{doc_id}").json()["extraction_status"] == "done"


def test_non_retryable_error_fails_immediately_and_manual_entry_works(
    client, db, fake_gemini
) -> None:
    _, behaviour = fake_gemini
    behaviour["invoice"] = ExtractionError("HTTP 400 bad request", retryable=False)
    c = login(client, EXEC)
    doc_id = upload(c, shipment_id(db, "SHP-24812"), "invoice").json()["id"]
    run_next_job()
    assert c.get(f"/api/documents/{doc_id}").json()["extraction_status"] == "failed"
    r = c.post(f"/api/documents/{doc_id}/manual")
    assert r.status_code == 200 and r.json()["extraction_status"] == "manual"
    with SessionLocal() as s:
        n = s.scalar(
            select(text("count(*)")).select_from(FieldRow).where(FieldRow.document_id == doc_id)
        )
    assert n == len(HEADER["invoice"]) + len(LINES["invoice"])


def test_two_workers_never_claim_the_same_job(client, db) -> None:
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    upload(c, sid, "invoice")
    upload(c, sid, "packing_list")
    with SessionLocal() as a, SessionLocal() as b:
        j1, j2 = jobs.claim(a), jobs.claim(b)
        j3 = jobs.claim(a)
    assert j1 and j2 and j1.id != j2.id and j3 is None


# ---------- creating shipments ----------


def test_executive_creates_shipment_assigned_to_themselves(client) -> None:
    c = login(client, EXEC)
    importers = c.get("/api/importers").json()
    assert "contact_phone" not in importers[0]
    r = c.post("/api/shipments", json={"importer_id": importers[0]["id"]})
    assert r.status_code == 201
    body = r.json()
    assert body["ref"].startswith("SHP-2490") and body["assignee"]["name"] == "Meera Iyer"
    assert body["status"] == "draft" and body["documents"] == []


def test_only_managers_assign_to_others(client, db) -> None:
    other = db.scalar(text("SELECT id FROM users WHERE email = :e"), {"e": EXEC2})
    imp = db.scalar(text("SELECT id FROM importers LIMIT 1"))
    c = login(client, EXEC)
    r = c.post("/api/shipments", json={"importer_id": imp, "assignee_id": other})
    assert r.status_code == 403
    c.post("/api/auth/logout")
    r = login(c, MANAGER).post("/api/shipments", json={"importer_id": imp, "assignee_id": other})
    assert r.status_code == 201 and r.json()["assignee"]["id"] == other
    assert c.post("/api/shipments", json={"importer_id": 99999}).status_code == 422


def test_accepted_mismatch_counts_only_while_its_inputs_are_unchanged(client, db) -> None:
    from datetime import UTC, datetime

    from app.models import CheckResult
    from app.shipments.status import open_flags, recompute_status

    sid = shipment_id(db, "SHP-24811")
    check = CheckResult(
        shipment_id=sid,
        rule_id="X5",
        status="fail",
        inputs={"pl": "3165"},
        inputs_hash="h1",
        message="Gross weight differs",
    )
    db.add(check)
    db.flush()
    assert [f.kind for f in open_flags(db, sid)] == ["check_failed"]

    check.accepted_at, check.accepted_hash = datetime.now(UTC), "h1"
    check.accept_reason = "Pallet weight added at origin, confirmed by supplier"
    db.flush()
    assert open_flags(db, sid) == []

    check.inputs_hash = "h2"  # someone edited a value the acceptance was based on
    db.flush()
    assert [f.kind for f in open_flags(db, sid)] == ["check_failed"]
    shipment = db.get(Shipment, sid)
    recompute_status(db, shipment)
    assert shipment.open_flag_count == 1


def test_quota_exhaustion_waits_for_reset_without_spending_attempts(
    client, db, fake_gemini
) -> None:
    _, behaviour = fake_gemini
    behaviour["invoice"] = ExtractionError("quota", retryable=True, retry_after_s=4730, quota=True)
    c = login(client, EXEC)
    doc_id = upload(c, shipment_id(db, "SHP-24812"), "invoice").json()["id"]
    for _ in range(jobs.MAX_ATTEMPTS + 2):  # more than the retry budget
        run_next_job()
        with SessionLocal() as s:
            wait = s.scalar(text("SELECT run_after - now() FROM jobs"))
            s.execute(text("UPDATE jobs SET run_after = now()"))
            s.commit()
    assert wait.total_seconds() > 4000  # waited for the provider's reset time, not 5 s
    doc = c.get(f"/api/documents/{doc_id}").json()
    assert doc["extraction_status"] == "pending"
    assert doc["error"].startswith("Daily AI limit reached")


def test_manual_entry_while_waiting_cancels_the_queued_job(client, db, fake_gemini) -> None:
    _, behaviour = fake_gemini
    behaviour["invoice"] = ExtractionError("quota", retryable=True, retry_after_s=60, quota=True)
    c = login(client, EXEC)
    doc_id = upload(c, shipment_id(db, "SHP-24812"), "invoice").json()["id"]
    run_next_job()
    assert c.post(f"/api/documents/{doc_id}/manual").status_code == 200
    with SessionLocal() as s:
        s.execute(text("UPDATE jobs SET run_after = now()"))
        s.commit()
        assert jobs.claim(s) is None  # nothing left to overwrite the manual entry
    assert c.get(f"/api/documents/{doc_id}").json()["extraction_status"] == "manual"


def test_result_is_discarded_if_document_changed_during_the_call(client, db, monkeypatch) -> None:
    c = login(client, EXEC)
    doc_id = upload(c, shipment_id(db, "SHP-24812"), "invoice").json()["id"]

    def slow_extract(data, mime, doc_type):
        with SessionLocal() as other:  # the user switches to manual entry mid-call
            other.execute(
                text("UPDATE documents SET extraction_status = 'manual' WHERE id = :i"),
                {"i": doc_id},
            )
            other.commit()
        return fake_result(doc_type)

    monkeypatch.setattr(gemini, "extract", slow_extract)
    run_next_job()
    with SessionLocal() as s:
        n = s.scalar(text("SELECT count(*) FROM fields WHERE document_id = :i"), {"i": doc_id})
    assert n == 0
