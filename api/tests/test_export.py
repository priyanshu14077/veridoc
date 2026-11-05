"""Export: the server-side gate, the CSV layout and its injection guard, versioned exports and
the manager's reopen (PRD §8.5, F4)."""

import csv
import io

from sqlalchemy import select

from app.export.layout import COLUMNS, build_rows, escape_cell, to_csv
from app.models import AuditLog, Export, Shipment
from app.seed import seed_documents
from app.shipments.status import active_documents
from tests.conftest import EXEC, EXEC2, MANAGER, login
from tests.helpers import run_next_job, shipment_id, upload
from tests.test_check_api import checks, extracted, invoice_field

REASON = {"reason": "Supplier confirmed the invoice weight excludes pallets"}


def read_csv(data: bytes) -> list[dict[str, str]]:
    assert data.startswith(b"\xef\xbb\xbf"), "UTF-8 BOM so Excel reads it correctly"
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))


def cleared(client, db, fake_gemini) -> int:
    """SHP-24811 with its weight mismatch accepted, so nothing blocks the export."""
    sid = extracted(client, db, fake_gemini)
    client.post(f"/api/checks/{checks(client, sid)['X5']['id']}/accept", json=REASON)
    assert client.get(f"/api/shipments/{sid}").json()["status"] == "cleared"
    return sid


# ---------- layout ----------


def test_cells_that_a_spreadsheet_would_run_as_formulas_are_escaped() -> None:
    for bad in ("=1+1", "+91 22", "-2", "@SUM(A1)", "\tx", "\rx"):
        assert escape_cell(bad) == "'" + bad
    for ok in ("3165.00", "Company E Lighting", "", "SHP-24811", "a=b"):
        assert escape_cell(ok) == ok


def test_csv_has_one_header_line_and_escapes_every_cell() -> None:
    rows = [{"record_type": "H", "shipment_ref": "SHP-1", "supplier_name": '=HYPERLINK("x")'}]
    out = read_csv(to_csv(rows))
    assert list(out[0]) == list(COLUMNS)
    assert out[0]["supplier_name"] == '\'=HYPERLINK("x")'


def test_rows_for_a_sample_shipment_use_the_filing_formats(db) -> None:
    seed_documents(db)
    s = db.scalar(select(Shipment).where(Shipment.ref == "SHP-24812"))
    rows = build_rows(s, active_documents(db, s.id))
    head, lines = rows[0], rows[1:]
    assert head["record_type"] == "H" and head["shipment_ref"] == "SHP-24812"
    assert head["importer_iec"] == s.importer.iec_code
    day, month, year = head["invoice_date"].split("/")  # DD/MM/YYYY
    assert len(day) == 2 and len(month) == 2 and len(year) == 4
    assert head["invoice_value"].replace(".", "").isdigit()  # no thousands separators
    assert head["container_nos"] and " / " not in head["container_nos"]
    assert lines and all(r["record_type"] == "L" for r in lines)
    assert [r["line_no"] for r in lines] == [str(i) for i in range(1, len(lines) + 1)]
    assert all(r["description"] and r["qty"] and r["line_amount"] for r in lines)


# ---------- the gate ----------


def test_export_is_refused_while_a_check_fails(client, db, fake_gemini) -> None:
    sid = extracted(client, db, fake_gemini)
    r = client.post(f"/api/shipments/{sid}/export")
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert [b["kind"] for b in detail["blockers"]] == ["check_failed"]
    assert "45 kg" in detail["blockers"][0]["message"]
    assert db.scalar(select(Export).where(Export.shipment_id == sid)) is None

    preview = client.get(f"/api/shipments/{sid}/export/preview").json()
    assert len(preview["blockers"]) == 1 and preview["rows"][0]["record_type"] == "H"


def test_export_is_refused_without_documents_or_without_an_invoice(client, db) -> None:
    c = login(client, EXEC)
    sid = shipment_id(db, "SHP-24812")
    r = c.post(f"/api/shipments/{sid}/export")
    assert (
        r.status_code == 409 and "documents first" in r.json()["detail"]["blockers"][0]["message"]
    )

    for t in ("packing_list", "bill_of_lading"):
        upload(c, sid, t)
        run_next_job()
    kinds = [b["kind"] for b in c.post(f"/api/shipments/{sid}/export").json()["detail"]["blockers"]]
    assert "missing_document" in kinds


def test_a_cleared_shipment_exports_v1_and_becomes_read_only(client, db, fake_gemini) -> None:
    sid = cleared(client, db, fake_gemini)
    r = client.post(f"/api/shipments/{sid}/export")
    assert r.status_code == 201, r.text
    e = r.json()
    assert (
        e["version"] == 1
        and e["file_name"] == "SHP-24811-v1.csv"
        and e["created_by"] == "Meera Iyer"
    )

    f = client.get(f"/api/exports/{e['id']}/file")
    assert f.status_code == 200 and "attachment" in f.headers["content-disposition"]
    rows = read_csv(f.content)
    assert len(rows) == e["row_count"] and rows[0]["gross_weight_kg"] == "3165.00"

    detail = client.get(f"/api/shipments/{sid}").json()
    assert detail["status"] == "exported"
    log = db.scalar(select(AuditLog).where(AuditLog.action == "exported"))
    assert log is not None and log.after["sha256"] == e["sha256"]

    # Nothing about it can change until a manager reopens it.
    gross = invoice_field(client, sid, "total_gross_weight_kg")
    patch = {"version": gross["version"], "value": "3,165"}
    assert client.patch(f"/api/fields/{gross['id']}", json=patch).status_code == 409
    assert upload(client, sid, "invoice", ref="SHP-24811").status_code == 409
    assert client.post(f"/api/shipments/{sid}/export").status_code == 409


def test_a_formula_typed_into_a_field_is_escaped_in_the_file(client, db, fake_gemini) -> None:
    sid = cleared(client, db, fake_gemini)
    f = invoice_field(client, sid, "supplier_name")
    payload = {"version": f["version"], "value": '=HYPERLINK("http://x.example","open")'}
    assert client.patch(f"/api/fields/{f['id']}", json=payload).status_code == 200
    e = client.post(f"/api/shipments/{sid}/export").json()
    head = read_csv(client.get(f"/api/exports/{e['id']}/file").content)[0]
    assert head["supplier_name"].startswith("'=")


# ---------- reopen and versions ----------


def test_only_a_manager_can_reopen_and_re_export_makes_v2(client, db, fake_gemini) -> None:
    sid = cleared(client, db, fake_gemini)
    v1 = client.post(f"/api/shipments/{sid}/export").json()
    assert client.post(f"/api/shipments/{sid}/reopen", json=REASON).status_code == 403
    client.post("/api/auth/logout")

    m = login(client, MANAGER)
    assert m.post(f"/api/shipments/{sid}/reopen", json={"reason": "short"}).status_code == 422
    r = m.post(f"/api/shipments/{sid}/reopen", json={"reason": "Importer sent a revised invoice"})
    assert r.status_code == 200
    # The accepted mismatch still matches its values, so nothing new is open.
    assert r.json()["status"] == "cleared"
    assert m.post(f"/api/shipments/{sid}/reopen", json=REASON).status_code == 409

    gross = invoice_field(m, sid, "total_gross_weight_kg")
    m.patch(f"/api/fields/{gross['id']}", json={"version": gross["version"], "value": "3,165"})
    v2 = m.post(f"/api/shipments/{sid}/export").json()
    assert v2["version"] == 2 and v2["created_by"] == "Anil Kulkarni"

    history = m.get(f"/api/shipments/{sid}/exports").json()
    assert [h["version"] for h in history] == [2, 1]
    assert history[1]["sha256"] == v1["sha256"]  # v1 is kept exactly as it was
    assert m.get(f"/api/exports/{v1['id']}/file").status_code == 200
    log = db.scalar(select(AuditLog).where(AuditLog.action == "reopened"))
    assert log is not None and log.reason == "Importer sent a revised invoice"


def test_reopen_brings_back_whatever_is_open(client, db, fake_gemini) -> None:
    sid = cleared(client, db, fake_gemini)
    client.post(f"/api/shipments/{sid}/export")
    client.post("/api/auth/logout")
    m = login(client, MANAGER)
    m.post(f"/api/shipments/{sid}/reopen", json=REASON)
    gross = invoice_field(m, sid, "total_gross_weight_kg")
    m.patch(f"/api/fields/{gross['id']}", json={"version": gross["version"], "value": "3,000"})
    assert m.get(f"/api/shipments/{sid}").json()["status"] == "needs_review"
    assert m.post(f"/api/shipments/{sid}/export").status_code == 409


def test_other_executives_cannot_see_or_download_exports(client, db, fake_gemini) -> None:
    sid = cleared(client, db, fake_gemini)
    e = client.post(f"/api/shipments/{sid}/export").json()
    client.post("/api/auth/logout")
    other = login(client, EXEC2)
    assert other.get(f"/api/shipments/{sid}/exports").status_code == 404
    assert other.get(f"/api/exports/{e['id']}/file").status_code == 404
    assert other.post(f"/api/shipments/{sid}/export").status_code == 404
