import logging
from sqlalchemy.orm import Session
from typing import Optional

from app.models import Case, CaseEvent, User

logger = logging.getLogger(__name__)


def record_case_event(
    db: Session,
    case: Case,
    actor: Optional[User],
    event_type: str,
    detail: Optional[str] = None
) -> CaseEvent:
    """
    Core function for the immutable audit trail of a Case.
    Must be called for every case mutation (creation, assignment, status change, notes).
    Creates a CaseEvent within the current database transaction.
    """
    event = CaseEvent(
        case_id=case.id,
        actor_user_id=actor.id if actor else None,
        event_type=event_type,
        detail=detail
    )
    db.add(event)
    # Note: We do not db.commit() here; the caller is responsible for committing
    # the entire transaction (e.g. status update + event) atomically.
    return event
