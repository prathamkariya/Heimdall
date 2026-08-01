from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, Anomaly, Case, CaseNote, MarketData

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
    
    # Search Anomalies (by ID if numeric, otherwise by symbol or pattern_scores)
    anomaly_filter = []
    if q.isdigit():
        anomaly_filter.append(Anomaly.id == int(q))
    anomaly_filter.append(MarketData.symbol.ilike(query_str))
    anomaly_filter.append(Anomaly.pattern_scores.ilike(query_str))
    
    anomalies = db.query(Anomaly).join(MarketData).filter(or_(*anomaly_filter)).limit(limit).all()
    
    # Search Cases
    case_filter = []
    if q.isdigit():
        case_filter.append(Case.id == int(q))
    case_filter.append(Case.title.ilike(query_str))
    case_filter.append(Case.notes.any(CaseNote.body.ilike(query_str)))
    
    cases = db.query(Case).filter(or_(*case_filter)).limit(limit).all()
    
    results = []
    
    for a in anomalies:
        primary_signal = "ANOMALY"
        if a.pattern_scores:
            import json
            try:
                parsed = json.loads(a.pattern_scores)
                max_val = 0.0
                for pat, val in parsed.items():
                    if val > max_val and val >= 0.5:
                        max_val = val
                        primary_signal = pat.upper().replace('_', ' ')
            except Exception:
                pass

        results.append({
            "id": f"anomaly-{a.id}",
            "entity_id": a.id,
            "type": "anomaly",
            "title": f"Anomaly #{a.id} ({a.market_data.symbol})",
            "subtitle": f"{primary_signal} (Score: {a.anomaly_score:.2f})",
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
