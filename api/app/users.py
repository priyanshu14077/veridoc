from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.deps import DB, CurrentUser
from app.models import User

router = APIRouter(prefix="/users", tags=["users"])


class TeamMember(BaseModel):
    id: int
    name: str
    role: str


@router.get("", response_model=list[TeamMember])
def list_team(_: CurrentUser, db: DB) -> list[User]:
    """Names and roles only: used for the assignee filter and assignment picker."""
    return list(db.scalars(select(User).where(User.is_active).order_by(User.name)))
