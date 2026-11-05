"""Every API route against each role (TDD §6). Walks the app's route table, so a new route that
forgets its auth dependency fails here without anyone remembering to add a test."""

import re

from app.main import app
from tests.conftest import EXEC, MANAGER, login

PUBLIC = {("POST", "/api/auth/login"), ("GET", "/api/health"), ("POST", "/api/auth/logout")}
MANAGER_ONLY = {
    ("GET", "/api/reports/overrides"),
    ("GET", "/api/reports/accuracy"),
    ("POST", "/api/shipments/{shipment_id}/reopen"),
}


def routes() -> list[tuple[str, str]]:
    # The OpenAPI schema lists every route, including those on included routers.
    paths = app.openapi()["paths"]
    return [(m.upper(), p) for p, ops in paths.items() for m in ops if p.startswith("/api")]


def call(client, method: str, path: str):
    url = re.sub(r"\{[^}]+\}", "1", path)
    body = {"json": {}} if method in {"POST", "PATCH", "PUT"} else {}
    return client.request(method, url, **body)


def test_the_route_table_is_what_this_test_expects() -> None:
    found = set(routes())
    assert PUBLIC | MANAGER_ONLY <= found
    assert len(found) >= 25


def test_every_route_but_login_and_health_needs_a_session(client) -> None:
    for method, path in routes():
        if (method, path) in PUBLIC:
            continue
        r = call(client, method, path)
        assert r.status_code == 401, f"{method} {path} answered {r.status_code} when signed out"


def test_manager_only_routes_refuse_an_executive(client) -> None:
    login(client, EXEC)
    for method, path in MANAGER_ONLY:
        r = call(client, method, path)
        assert r.status_code == 403, f"{method} {path} answered {r.status_code} for an executive"


def test_a_manager_gets_past_the_role_check_on_every_route(client) -> None:
    login(client, MANAGER)
    for method, path in routes():
        if (method, path) == ("POST", "/api/auth/logout"):
            continue
        r = call(client, method, path)
        assert r.status_code not in (401, 403), f"{method} {path} refused a manager"
