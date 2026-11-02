import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import User, UserSession

COOKIE_NAME = "cc_session"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User) -> str:
    """Return the raw token for the cookie; only its hash is stored."""
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    db.add(
        UserSession(
            token_hash=_hash(token),
            user_id=user.id,
            last_seen_at=now,
            expires_at=now + timedelta(hours=get_settings().session_ttl_hours),
        )
    )
    return token


def resolve_session(db: Session, token: str | None) -> User | None:
    """Look up an unexpired session and slide its idle expiry forward."""
    if not token:
        return None
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == _hash(token)))
    now = datetime.now(UTC)
    if sess is None or sess.expires_at <= now or not sess.user.is_active:
        return None
    # Only write when a minute has passed, so every request isn't a DB write.
    if now - sess.last_seen_at > timedelta(minutes=1):
        sess.last_seen_at = now
        sess.expires_at = now + timedelta(hours=get_settings().session_ttl_hours)
        db.commit()
    return sess.user


def revoke_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == _hash(token)))
