from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.deps import DB, CurrentUser
from app.models import Importer, Supplier

router = APIRouter(tags=["parties"])


class ImporterOut(BaseModel):
    id: int
    name: str
    iec_code: str


class SupplierOut(BaseModel):
    id: int
    name: str
    country: str


@router.get("/importers", response_model=list[ImporterOut])
def list_importers(_: CurrentUser, db: DB) -> list[Importer]:
    """Company names and IEC only; contact details stay behind the logged reveal."""
    return list(db.scalars(select(Importer).order_by(Importer.name)))


@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(_: CurrentUser, db: DB) -> list[Supplier]:
    return list(db.scalars(select(Supplier).order_by(Supplier.name)))
