"""Apply hand-written SQL migrations in filename order. Run: python -m app.migrate"""

from pathlib import Path

from sqlalchemy import Engine, text

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def migrate(engine: Engine) -> list[str]:
    applied: list[str] = []
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                " name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
            )
        )
        # Serialise concurrent deploys.
        conn.execute(text("SELECT pg_advisory_xact_lock(724001)"))
        done = set(conn.execute(text("SELECT name FROM schema_migrations")).scalars())
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in done:
                continue
            conn.exec_driver_sql(path.read_text())
            conn.execute(text("INSERT INTO schema_migrations(name) VALUES (:n)"), {"n": path.name})
            applied.append(path.name)
    return applied


if __name__ == "__main__":
    from app.db import engine

    names = migrate(engine)
    print("applied:", ", ".join(names) if names else "nothing (up to date)")
