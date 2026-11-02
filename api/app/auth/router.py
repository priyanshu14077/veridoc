from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select

from app import audit
from app.auth.deps import DB, CurrentUser
from app.auth.passwords import verify_password
from app.auth.sessions import COOKIE_NAME, create_session, revoke_session
from app.config import get_settings
from app.models import LoginAttempt, User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: Literal["executive", "manager"]


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if get_settings().trust_proxy and fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _throttle(db: DB, key: str) -> None:
    s = get_settings()
    since = datetime.now(UTC) - timedelta(seconds=s.login_window_seconds)
    db.execute(delete(LoginAttempt).where(LoginAttempt.created_at < since))
    recent = db.scalar(select(func.count()).where(LoginAttempt.key == key))
    if recent and recent >= s.login_max_attempts:
        db.commit()
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Wait a minute and try again."
        )


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: DB) -> User:
    email = body.email.lower()
    key = f"{_client_ip(request)}|{email}"
    _throttle(db, key)
    user = db.scalar(select(User).where(User.email == email))
    ok = verify_password(user.password_hash if user else None, body.password)
    if not ok or user is None or not user.is_active:
        db.add(LoginAttempt(key=key))
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect")

    db.execute(delete(LoginAttempt).where(LoginAttempt.key == key))
    token = create_session(db, user)
    audit.record(db, actor_id=user.id, entity="user", entity_id=user.id, action="login")
    db.commit()
    s = get_settings()
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        max_age=s.session_ttl_hours * 3600,
        path="/",
    )
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response, db: DB, token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None
) -> None:
    revoke_session(db, token)
    db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
