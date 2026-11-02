from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def record(
    db: Session,
    *,
    actor_id: int | None,
    entity: str,
    entity_id: int | None,
    action: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    reason: str | None = None,
) -> None:
    """Append an audit row in the caller's transaction (committed with the change it describes)."""
    db.add(
        AuditLog(
            actor_id=actor_id,
            entity=entity,
            entity_id=entity_id,
            action=action,
            before=before,
            after=after,
            reason=reason,
        )
    )
