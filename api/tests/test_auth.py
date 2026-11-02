from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.auth.passwords import hash_password, verify_password
from app.models import AuditLog, UserSession
from tests.conftest import EXEC, login


def test_password_hash_roundtrip() -> None:
    h = hash_password("s3cret")
    assert h.startswith("$argon2id$")
    assert verify_password(h, "s3cret")
    assert not verify_password(h, "wrong")
    assert not verify_password(None, "anything")


def test_login_sets_httponly_cookie_and_me_works(client) -> None:
    r = client.post("/api/auth/login", json={"email": EXEC, "password": "crosscheck-demo"})
    assert r.status_code == 200
    assert r.json()["role"] == "executive"
    cookie = r.headers["set-cookie"]
    assert "cc_session=" in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()
    assert client.get("/api/auth/me").json()["email"] == EXEC


def test_email_is_case_insensitive(client) -> None:
    r = client.post("/api/auth/login", json={"email": EXEC.upper(), "password": "crosscheck-demo"})
    assert r.status_code == 200


def test_wrong_password_and_unknown_email_look_the_same(client) -> None:
    a = client.post("/api/auth/login", json={"email": EXEC, "password": "nope"})
    b = client.post("/api/auth/login", json={"email": "ghost@x.demo", "password": "nope"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_login_is_throttled_after_five_failures(client) -> None:
    for _ in range(5):
        assert (
            client.post("/api/auth/login", json={"email": EXEC, "password": "x"}).status_code == 401
        )
    r = client.post("/api/auth/login", json={"email": EXEC, "password": "crosscheck-demo"})
    assert r.status_code == 429


def test_invalid_body_is_rejected(client) -> None:
    assert (
        client.post("/api/auth/login", json={"email": "not-an-email", "password": "x"}).status_code
        == 422
    )
    assert client.post("/api/auth/login", json={"email": EXEC, "password": ""}).status_code == 422


def test_me_requires_session(client) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_logout_revokes_session(client, db) -> None:
    login(client, EXEC)
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert db.scalar(select(UserSession)) is None


def test_expired_session_is_rejected(client, db) -> None:
    login(client, EXEC)
    db.execute(update(UserSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
    db.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_only_token_hash_is_stored(client, db) -> None:
    login(client, EXEC)
    raw = client.cookies.get("cc_session")
    stored = db.scalar(select(UserSession.token_hash))
    assert raw and stored and raw != stored and len(stored) == 64


def test_login_is_audited(client, db) -> None:
    login(client, EXEC)
    assert db.scalar(select(AuditLog.action)) == "login"


def test_cross_origin_post_is_blocked(client) -> None:
    r = client.post(
        "/api/auth/login",
        json={"email": EXEC, "password": "crosscheck-demo"},
        headers={"Origin": "https://evil.example"},
    )
    assert r.status_code == 403
