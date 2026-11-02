from sqlalchemy import select

from app.models import AuditLog, Shipment
from tests.conftest import EXEC, EXEC2, MANAGER, login


def _refs(resp) -> set[str]:
    return {row["ref"] for row in resp.json()["items"]}


def test_list_requires_login(client) -> None:
    assert client.get("/api/shipments").status_code == 401


def test_manager_sees_all_shipments(client) -> None:
    r = login(client, MANAGER).get("/api/shipments?page_size=100")
    assert r.json()["total"] == 12


def test_executive_sees_own_and_unassigned_only(client, db) -> None:
    r = login(client, EXEC).get("/api/shipments?page_size=100")
    refs = _refs(r)
    rohans = {
        s.ref for s in db.scalars(select(Shipment)) if s.assignee and s.assignee.email == EXEC2
    }
    assert rohans and refs.isdisjoint(rohans)
    assert "SHP-24811" in refs  # Meera's
    assert "SHP-24814" in refs  # unassigned


def test_executive_gets_404_for_someone_elses_shipment(client, db) -> None:
    other = db.scalar(select(Shipment).where(Shipment.ref == "SHP-24813"))  # Rohan's
    assert login(client, EXEC).get(f"/api/shipments/{other.id}").status_code == 404


def test_filters_and_search(client) -> None:
    c = login(client, MANAGER)
    assert _refs(c.get("/api/shipments?q=24811")) == {"SHP-24811"}
    assert c.get("/api/shipments?q=Company C").json()["total"] >= 1
    unassigned = c.get("/api/shipments?assignee=unassigned").json()
    assert all(row["assignee"] is None for row in unassigned["items"]) and unassigned["total"] == 3
    assert c.get("/api/shipments?status=draft").json()["status_counts"] == {"draft": 12}


def test_bad_query_params_are_rejected(client) -> None:
    c = login(client, MANAGER)
    assert c.get("/api/shipments?status=bogus").status_code == 422
    assert c.get("/api/shipments?page_size=1000").status_code == 422
    assert c.get("/api/shipments?assignee=drop table").status_code == 422


def test_contact_is_masked_in_detail(client, db) -> None:
    s = db.scalar(select(Shipment).where(Shipment.ref == "SHP-24811"))
    body = login(client, EXEC).get(f"/api/shipments/{s.id}").json()
    assert body["contact"]["masked"] is True
    assert "00101" not in body["contact"]["phone"]
    assert body["can_reveal_contact"] is True


def test_assignee_can_reveal_contact_and_it_is_logged(client, db) -> None:
    s = db.scalar(select(Shipment).where(Shipment.ref == "SHP-24811"))
    r = login(client, EXEC).post(f"/api/shipments/{s.id}/contact/reveal")
    assert r.status_code == 200 and r.json()["phone"] == "+91 90000 00101"
    actions = db.scalars(select(AuditLog.action)).all()
    assert "contact_revealed" in actions


def test_non_assignee_cannot_reveal_contact_of_unassigned_shipment(client, db) -> None:
    s = db.scalar(select(Shipment).where(Shipment.ref == "SHP-24814"))  # unassigned
    c = login(client, EXEC)
    assert c.get(f"/api/shipments/{s.id}").json()["can_reveal_contact"] is False
    assert c.post(f"/api/shipments/{s.id}/contact/reveal").status_code == 403


def test_status_counts_follow_search_and_scope(client) -> None:
    assert login(client, MANAGER).get("/api/shipments?q=Company E").json()["status_counts"] == {
        "draft": 4
    }
    client.post("/api/auth/logout")
    assert login(client, EXEC).get("/api/shipments").json()["status_counts"] == {"draft": 8}
