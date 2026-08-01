from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, Anomaly, Case

router = APIRouter(prefix="/search", tags=["search"])

@router.get("")
def global_search(
    q: str = Query(..., min_length=1),
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fuzzy search across Anomalies and Cases."""
    
    query_str = f"%{q}%"
    
    # Search Anomalies (by ID if numeric, otherwise by symbol or signal)
    anomaly_filter = []
    if q.isdigit():
        anomaly_filter.append(Anomaly.id == int(q))
    anomaly_filter.append(Anomaly.symbol.ilike(query_str))
    anomaly_filter.append(Anomaly.primary_signal.ilike(query_str))
    
    anomalies = db.query(Anomaly).filter(or_(*anomaly_filter)).limit(limit).all()
    
    # Search Cases
    case_filter = []
    if q.isdigit():
        case_filter.append(Case.id == int(q))
    case_filter.append(Case.title.ilike(query_str))
    case_filter.append(Case.description.ilike(query_str))
    
    cases = db.query(Case).filter(or_(*case_filter)).limit(limit).all()
    
    results = []
    
    for a in anomalies:
        results.append({
            "id": f"anomaly-{a.id}",
            "entity_id": a.id,
            "type": "anomaly",
            "title": f"Anomaly #{a.id} ({a.symbol})",
            "subtitle": f"{a.primary_signal} (Score: {a.score})",
            "route": f"/anomalies?selected={a.id}"
        })
        
    for c in cases:
        results.append({
            "id": f"case-{c.id}",
            "entity_id": c.id,
            "type": "case",
            "title": f"Case #{c.id}: {c.title}",
            "subtitle": f"Status: {c.status}",
            "route": f"/investigations?selected={c.id}"
        })
        
    return {"results": results}
