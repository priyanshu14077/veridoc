"""Seed demo data. Idempotent: safe to run twice. Run: python -m app.seed

All companies and people are fictional (PRD A13). The brief's convention ("Company B") is kept
for suppliers so the sample rows from the brief map one to one.
"""

import hashlib
import json
import os
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.passwords import hash_password, verify_password
from app.extraction.gemini import ExtractionResult, response_model
from app.extraction.pipeline import store_result
from app.models import Document, Importer, Shipment, Supplier, User
from app.storage import get_storage

SAMPLES = Path(__file__).resolve().parents[2] / "sample-docs"
DOC_TYPES = ("invoice", "packing_list", "bill_of_lading")

# Demo password is public by design (it's printed in deployment.md); override per environment.
DEMO_PASSWORD = os.environ.get("SEED_DEMO_PASSWORD", "veridoc-demo")

USERS = [
    ("meera.exec@veridoc.demo", "Meera Iyer", "executive"),
    ("rohan.exec@veridoc.demo", "Rohan Desai", "executive"),
    ("anil.manager@veridoc.demo", "Anil Kulkarni", "manager"),
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
    ("SHP-24811", 0, 0, "meera.exec@veridoc.demo"),
    ("SHP-24812", 1, 1, "meera.exec@veridoc.demo"),
    ("SHP-24813", 2, 3, "rohan.exec@veridoc.demo"),
    ("SHP-24814", 0, 0, None),
    ("SHP-24815", 1, 2, "meera.exec@veridoc.demo"),
    ("SHP-24816", 2, 3, None),
    ("SHP-24817", 0, 0, "rohan.exec@veridoc.demo"),
    ("SHP-24818", 1, 1, "meera.exec@veridoc.demo"),
    ("SHP-24819", 2, 2, "rohan.exec@veridoc.demo"),
    ("SHP-24820", 0, 3, None),
    ("SHP-24821", 1, 1, "meera.exec@veridoc.demo"),
    ("SHP-24822", 2, 0, "rohan.exec@veridoc.demo"),
]

# Cleared shipments the seed files as an executive would, so the manager's accuracy report and
# overrides log have history. The rest stay open for the demo (SHP-24812 is left to export live).
HISTORY = ("SHP-24816", "SHP-24817", "SHP-24818", "SHP-24822")


def seed(db: Session) -> None:
    users: dict[str, User] = {}
    for email, name, role in USERS:
        u = db.scalar(select(User).where(User.email == email))
        if u is None:
            u = User(email=email, name=name, role=role, password_hash=hash_password(DEMO_PASSWORD))
            db.add(u)
        elif not verify_password(u.password_hash, DEMO_PASSWORD):
            # Demo accounts follow SEED_DEMO_PASSWORD, so changing it (as the rename did) applies.
            u.password_hash = hash_password(DEMO_PASSWORD)
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

    creator = users["anil.manager@veridoc.demo"]
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


def seed_documents(db: Session) -> int:
    """Attach the sample PDFs to their shipments and replay the recorded Gemini output through
    the same pipeline a live upload uses. Real model output, no API quota spent.
    Shipments that already have documents are left alone."""
    storage = get_storage()
    added = 0
    for ref, *_ in SHIPMENTS:
        shipment = db.scalar(select(Shipment).where(Shipment.ref == ref))
        folder = SAMPLES / ref
        if shipment is None or not folder.is_dir():
            continue
        if db.scalar(select(Document.id).where(Document.shipment_id == shipment.id).limit(1)):
            continue
        uploader = shipment.assignee_id or shipment.created_by
        for doc_type in DOC_TYPES:
            pdf = folder / f"{doc_type}.pdf"
            recorded = folder / f"{doc_type}.extraction.json"
            if not pdf.exists() or not recorded.exists():
                continue
            data = pdf.read_bytes()
            doc = Document(
                shipment_id=shipment.id,
                doc_type=doc_type,
                file_key=storage.put(data, ".pdf"),
                file_name=pdf.name,
                mime="application/pdf",
                size_bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
                page_count=1,
                uploaded_by=uploader,
            )
            db.add(doc)
            db.flush()
            rec = json.loads(recorded.read_text())
            parsed = response_model(doc_type).model_validate(rec["response"])
            store_result(
                db,
                doc,
                ExtractionResult(
                    parsed=parsed,
                    raw=rec["response"],
                    model=rec["model"],
                    latency_ms=rec["latency_ms"],
                    tokens_in=rec["tokens_in"],
                    tokens_out=rec["tokens_out"],
                ),
                attempt=1,
            )
            added += 1
        db.commit()
    return added


def seed_history(db: Session) -> int:
    """Review and export the HISTORY shipments through the same code the API runs: wherever the
    AI's value differs from the sample's ground truth, the assignee corrects it (audited), then
    exports. Shipments that are already exported, or still have open items, are left alone."""
    from app.export.router import export_shipment
    from app.extraction.catalog import field_def
    from app.fields.router import FieldPatch, patch_field
    from app.models import Export
    from app.reports.accuracy import comparable
    from app.shipments.status import active_documents

    exported = 0
    for ref in HISTORY:
        s = db.scalar(select(Shipment).where(Shipment.ref == ref))
        if s is None or db.scalar(select(Export.id).where(Export.shipment_id == s.id).limit(1)):
            continue
        user = db.get(User, s.assignee_id or s.created_by)
        assert user is not None
        truth = json.loads((SAMPLES / ref / "truth.json").read_text())
        country = s.supplier.country if s.supplier else None
        for doc in active_documents(db, s.id):
            t = truth[doc.doc_type]
            for f in list(doc.fields):
                is_line = f.line_index is not None
                want = (t["lines"][f.line_index] if is_line else t["header"]).get(f.key)
                fd = field_def(doc.doc_type, f.key, is_line)
                if want and comparable(fd, f.value, country) != comparable(fd, want, country):
                    patch_field(f.id, FieldPatch(version=f.version, value=want), user, db)
        db.refresh(s)
        if s.status == "cleared":
            export_shipment(s.id, user, db)
            exported += 1
    return exported


if __name__ == "__main__":
    from app.db import SessionLocal

    with SessionLocal() as session:
        seed(session)
        n = seed_documents(session)
        h = seed_history(session)
    print(f"seeded {len(USERS)} users, {len(SHIPMENTS)} shipments, {n} documents, {h} exports")
