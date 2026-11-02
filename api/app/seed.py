"""Seed demo data. Idempotent: safe to run twice. Run: python -m app.seed

All companies and people are fictional (PRD A13). The brief's convention ("Company B") is kept
for suppliers so the sample rows from the brief map one to one.
"""

import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.passwords import hash_password
from app.models import Importer, Shipment, Supplier, User

# Demo password is public by design (it's printed in deployment.md); override per environment.
DEMO_PASSWORD = os.environ.get("SEED_DEMO_PASSWORD", "crosscheck-demo")

USERS = [
    ("meera.exec@crosscheck.demo", "Meera Iyer", "executive"),
    ("rohan.exec@crosscheck.demo", "Rohan Desai", "executive"),
    ("anil.manager@crosscheck.demo", "Anil Kulkarni", "manager"),
]

IMPORTERS = [
    (
        "Company E Lighting Pvt Ltd",
        "0300000001",
        "Kavita Rao",
        "+91 90000 00101",
        "kavita.rao@company-e.example",
    ),
    (
        "Company F Flow Controls Ltd",
        "0300000002",
        "Sameer Joshi",
        "+91 90000 00102",
        "sameer.joshi@company-f.example",
    ),
    (
        "Company G Packaging Pvt Ltd",
        "0300000003",
        "Neha Pillai",
        "+91 90000 00103",
        "neha.pillai@company-g.example",
    ),
]

SUPPLIERS = [
    ("Company B", "China"),
    ("Company C", "Sweden"),
    ("Company H", "Germany"),
    ("Company J", "Vietnam"),
]

# (ref, importer idx, supplier idx, assignee email | None). SHP-24811/24812 are the brief's rows.
SHIPMENTS = [
    ("SHP-24811", 0, 0, "meera.exec@crosscheck.demo"),
    ("SHP-24812", 1, 1, "meera.exec@crosscheck.demo"),
    ("SHP-24813", 2, 3, "rohan.exec@crosscheck.demo"),
    ("SHP-24814", 0, 0, None),
    ("SHP-24815", 1, 2, "meera.exec@crosscheck.demo"),
    ("SHP-24816", 2, 3, None),
    ("SHP-24817", 0, 0, "rohan.exec@crosscheck.demo"),
    ("SHP-24818", 1, 1, "meera.exec@crosscheck.demo"),
    ("SHP-24819", 2, 2, "rohan.exec@crosscheck.demo"),
    ("SHP-24820", 0, 3, None),
    ("SHP-24821", 1, 1, "meera.exec@crosscheck.demo"),
    ("SHP-24822", 2, 0, "rohan.exec@crosscheck.demo"),
]


def seed(db: Session) -> None:
    users: dict[str, User] = {}
    for email, name, role in USERS:
        u = db.scalar(select(User).where(User.email == email))
        if u is None:
            u = User(email=email, name=name, role=role, password_hash=hash_password(DEMO_PASSWORD))
            db.add(u)
        users[email] = u

    importers: list[Importer] = []
    for name, iec, cname, phone, mail in IMPORTERS:
        imp = db.scalar(select(Importer).where(Importer.iec_code == iec))
        if imp is None:
            imp = Importer(
                name=name, iec_code=iec, contact_name=cname, contact_phone=phone, contact_email=mail
            )
            db.add(imp)
        importers.append(imp)

    suppliers: list[Supplier] = []
    for name, country in SUPPLIERS:
        sup = db.scalar(select(Supplier).where(Supplier.name == name, Supplier.country == country))
        if sup is None:
            sup = Supplier(name=name, country=country)
            db.add(sup)
        suppliers.append(sup)
    db.flush()

    creator = users["anil.manager@crosscheck.demo"]
    for ref, imp_i, sup_i, assignee in SHIPMENTS:
        if db.scalar(select(Shipment).where(Shipment.ref == ref)):
            continue
        db.add(
            Shipment(
                ref=ref,
                importer_id=importers[imp_i].id,
                supplier_id=suppliers[sup_i].id,
                assignee_id=users[assignee].id if assignee else None,
                created_by=creator.id,
            )
        )
    db.commit()


if __name__ == "__main__":
    from app.db import SessionLocal

    with SessionLocal() as session:
        seed(session)
    print(f"seeded {len(USERS)} users, {len(SHIPMENTS)} shipments")
