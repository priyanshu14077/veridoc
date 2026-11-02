from collections.abc import Callable
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.sessions import COOKIE_NAME, resolve_session
from app.db import get_db
from app.models import User

DB = Annotated[Session, Depends(get_db)]


def current_user(db: DB, token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None) -> User:
    user = resolve_session(db, token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(*roles: str) -> Callable[[User], User]:
    def dep(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role can't do this")
        return user

    return dep
