"""A server seeded before the rename keeps its users and signs in with the Veridoc demo login."""

from pathlib import Path

from sqlalchemy import select, text, update

from app.auth.passwords import hash_password
from app.migrate import MIGRATIONS_DIR
from app.models import Shipment, User
from app.seed import seed
from tests.conftest import EXEC, login


def test_old_demo_accounts_move_to_veridoc_and_keep_their_shipments(client, db) -> None:
    user = db.scalar(select(User).where(User.email == EXEC))
    owned = db.scalars(select(Shipment.id).where(Shipment.assignee_id == user.id)).all()
    # Put the account back the way the live server has it: old domain, old password.
    db.execute(
        update(User)
        .where(User.id == user.id)
        .values(email="meera.exec@crosscheck.demo", password_hash=hash_password("crosscheck-demo"))
    )
    db.commit()

    sql = Path(MIGRATIONS_DIR, "0003_veridoc_demo_emails.sql").read_text()
    db.execute(text(sql))
    db.commit()
    seed(db)
    db.commit()

    db.expire_all()
    moved = db.scalar(select(User).where(User.email == EXEC))
    assert moved is not None and moved.id == user.id
    assert db.scalar(select(User).where(User.email.like("%@crosscheck.demo"))) is None
    assert db.scalars(select(Shipment.id).where(Shipment.assignee_id == user.id)).all() == owned
    login(client, EXEC)
