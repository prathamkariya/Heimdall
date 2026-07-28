from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Anomaly,
    Case,
    CaseAnomaly,
    CaseEvent,
    CaseNote,
    CaseStatus,
    MarketData,
    User,
)
from app.schemas import (
    CaseAssign,
    CaseCreate,
    CaseEventResponse,
    CaseLinkAnomalies,
    CaseNoteCreate,
    CaseNoteResponse,
    CasePaginatedResponse,
    CaseResponse,
    CaseUpdate,
    UserResponse,
)
from app.services.case_service import record_case_event

router = APIRouter(prefix="/cases", tags=["cases"])


from app.auth_policy import verify_case_access


def get_case_if_visible(db: Session, case_id: int, current_user: User) -> Case:
    """Helper to fetch a case and enforce visibility rules."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    
    verify_case_access(case, current_user)
    return case


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    system_user = db.query(User).filter(
        or_(
            User.email == "system@marketsurveillance.local",
            User.email == "system_surveillance@example.com"
        )
    ).first()
    system_user_id = system_user.id if system_user else None

    # B2: Visibility check for every anomaly ID
    anomalies = (
        db.query(Anomaly)
        .join(MarketData, Anomaly.market_data_id == MarketData.id)
        .filter(Anomaly.id.in_(payload.anomaly_ids))
        .filter(
            or_(
                MarketData.user_id == current_user.id,
                MarketData.user_id == system_user_id
            )
        )
        .all()
    )
    
    if len(anomalies) != len(payload.anomaly_ids):
        # 403 as specifically requested by Phase B2 if visibility check fails
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Forbidden: One or more anomalies are not owned by you or system."
        )

    case = Case(
        title=payload.title,
        created_by_user_id=current_user.id,
        status=CaseStatus.OPEN
    )
    db.add(case)
    db.flush()  # to get case.id

    for anomaly in anomalies:
        case_anomaly = CaseAnomaly(case_id=case.id, anomaly_id=anomaly.id)
        db.add(case_anomaly)

    # B5: Audit log
    record_case_event(db, case, current_user, "CREATED", f"Case created with {len(anomalies)} anomalies")

    db.commit()
    db.refresh(case)
    return case



@router.get("", response_model=CasePaginatedResponse)
def list_cases(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Case)
    
    if current_user.role != "analyst":
        query = query.filter(
            or_(
                Case.created_by_user_id == current_user.id,
                Case.assigned_to_user_id == current_user.id
            )
        )
        
    total = query.count()
    items = query.order_by(Case.created_at.desc()).offset(offset).limit(limit).all()
    
    return CasePaginatedResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset
    )


@router.get("/analysts", response_model=list[UserResponse])
def list_analysts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all users with the analyst role (to populate assignees dropdown)."""
    analysts = db.query(User).filter(User.role == "analyst").all()
    return analysts


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_case_if_visible(db, case_id, current_user)


@router.patch("/{case_id}", response_model=CaseResponse)
def update_case(
    case_id: int,
    payload: CaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_if_visible(db, case_id, current_user)
    
    if payload.status and payload.status != case.status:
        # Simple transition check (we don't strictly enforce deep logic, but prevent CLOSED -> OPEN if needed, though B2 implies any valid transition is okay unless we have a specific table. 
        # B2: "validate the transition is a real one... explicit small state-transition table"
        VALID_TRANSITIONS = {
            CaseStatus.OPEN: [CaseStatus.IN_REVIEW, CaseStatus.DISMISSED, CaseStatus.CLOSED],
            CaseStatus.IN_REVIEW: [CaseStatus.ESCALATED, CaseStatus.DISMISSED, CaseStatus.CLOSED, CaseStatus.OPEN],
            CaseStatus.ESCALATED: [CaseStatus.IN_REVIEW, CaseStatus.DISMISSED, CaseStatus.CLOSED],
            CaseStatus.DISMISSED: [CaseStatus.OPEN],  # Allow reopening
            CaseStatus.CLOSED: [CaseStatus.OPEN],     # Allow reopening
        }
        if payload.status not in VALID_TRANSITIONS.get(case.status, []):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid state transition from {case.status} to {payload.status}"
            )

        old_status = case.status
        case.status = payload.status
        if payload.status in [CaseStatus.DISMISSED, CaseStatus.CLOSED]:
            case.closed_at = datetime.now(timezone.utc)
        elif old_status in [CaseStatus.DISMISSED, CaseStatus.CLOSED]:
            case.closed_at = None
            
        record_case_event(db, case, current_user, "STATUS_CHANGE", f"{old_status} -> {payload.status}")

    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/assign", response_model=CaseResponse)
def assign_case(
    case_id: int,
    payload: CaseAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_if_visible(db, case_id, current_user)
    
    if current_user.role != "analyst" and case.created_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only analysts or the case creator can assign cases"
        )
        
    target_user = db.query(User).filter(User.id == payload.assignee_user_id).first()
    if not target_user or target_user.role != "analyst":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target user is not an analyst"
        )
        
    case.assigned_to_user_id = target_user.id
    record_case_event(db, case, current_user, "ASSIGNED", f"Assigned to user {target_user.id}")
    
    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/notes", response_model=CaseNoteResponse)
def add_case_note(
    case_id: int,
    payload: CaseNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_if_visible(db, case_id, current_user)
    
    note = CaseNote(
        case_id=case.id,
        author_user_id=current_user.id,
        body=payload.body
    )
    db.add(note)
    record_case_event(db, case, current_user, "NOTE_ADDED", "Added a case note")
    
    db.commit()
    db.refresh(note)
    return note


@router.get("/{case_id}/notes", response_model=list[CaseNoteResponse])
def get_case_notes(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_if_visible(db, case_id, current_user)
    notes = db.query(CaseNote).filter(CaseNote.case_id == case.id).order_by(CaseNote.created_at.asc()).all()
    return notes


@router.get("/{case_id}/events", response_model=list[CaseEventResponse])
def get_case_events(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_if_visible(db, case_id, current_user)
    events = db.query(CaseEvent).filter(CaseEvent.case_id == case.id).order_by(CaseEvent.created_at.asc()).all()
    return events


@router.post("/{case_id}/anomalies", response_model=CaseResponse)
def link_anomalies_to_case(
    case_id: int,
    payload: CaseLinkAnomalies,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Link anomalies to an existing case, enforcing visibility checks and recording ANOMALY_LINKED events."""
    case = get_case_if_visible(db, case_id, current_user)

    system_user = db.query(User).filter(
        or_(
            User.email == "system@marketsurveillance.local",
            User.email == "system_surveillance@example.com"
        )
    ).first()
    system_user_id = system_user.id if system_user else None

    # Visibility check for every anomaly ID to link
    anomalies = (
        db.query(Anomaly)
        .join(MarketData, Anomaly.market_data_id == MarketData.id)
        .filter(Anomaly.id.in_(payload.anomaly_ids))
        .filter(
            or_(
                MarketData.user_id == current_user.id,
                MarketData.user_id == system_user_id
            )
        )
        .all()
    )

    if len(anomalies) != len(payload.anomaly_ids):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: One or more anomalies are not owned by you or system."
        )

    # Check existing links to avoid duplicate entry errors
    existing_links = db.query(CaseAnomaly.anomaly_id).filter(
        CaseAnomaly.case_id == case.id,
        CaseAnomaly.anomaly_id.in_(payload.anomaly_ids)
    ).all()
    existing_ids = {r[0] for r in existing_links}

    new_anomalies = [a for a in anomalies if a.id not in existing_ids]

    if new_anomalies:
        for anomaly in new_anomalies:
            case_anomaly = CaseAnomaly(case_id=case.id, anomaly_id=anomaly.id)
            db.add(case_anomaly)
            # Record CaseEvent
            record_case_event(
                db,
                case,
                current_user,
                "ANOMALY_LINKED",
                f"Linked anomaly {anomaly.market_data.symbol} ID {anomaly.id} to Case"
            )
        db.commit()
        db.refresh(case)

    return case
