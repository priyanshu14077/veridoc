import os
import tempfile

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://crosscheck:crosscheck@localhost:5433/crosscheck_test"
)
os.environ["STORAGE_DIR"] = tempfile.mkdtemp(prefix="crosscheck-test-")
os.environ["GEMINI_API_KEY"] = ""  # tests must never reach the real model

from collections.abc import Iterator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.migrate import migrate  # noqa: E402
from app.seed import DEMO_PASSWORD, seed  # noqa: E402

ORIGIN = {"Origin": "http://localhost:3000"}


@pytest.fixture(scope="session", autouse=True)
def _schema() -> None:
    assert engine.url.database == "crosscheck_test", "tests must never run against the dev DB"
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    migrate(engine)


@pytest.fixture(autouse=True)
def _data() -> Iterator[None]:
    with engine.begin() as conn:
        tables = (
            conn.execute(
                text(
                    "SELECT tablename FROM pg_tables WHERE schemaname='public'"
                    " AND tablename <> 'schema_migrations'"
                )
            )
            .scalars()
            .all()
        )
        conn.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        seed(db)
    get_settings.cache_clear()
    yield


@pytest.fixture
def db() -> Iterator[Session]:
    with SessionLocal() as s:
        yield s


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, headers=ORIGIN)


def login(client: TestClient, email: str) -> TestClient:
    r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return client


EXEC = "meera.exec@crosscheck.demo"
EXEC2 = "rohan.exec@crosscheck.demo"
MANAGER = "anil.manager@crosscheck.demo"
