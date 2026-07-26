"""app/routers/reports.py"""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from fastapi.responses import PlainTextResponse

from app.database import get_db
from app.models import User, Anomaly, MarketData, Case
from sqlalchemy.orm import joinedload
from app.dependencies import get_current_user
from app.services.mar_generator import generate_mar
from app.auth_policy import verify_case_access

router = APIRouter(prefix="/reports", tags=["Reports"])

# Limit concurrent Gemini generation requests to avoid exhausting workers/rate limits
mar_generation_semaphore = asyncio.BoundedSemaphore(5)

@router.get("/mar/case/{case_id}")
async def get_mar_report(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate an AI-driven Market Abuse Report (MAR) for a specific case.
    Returns markdown content. Accessible by case creator, assignee, or system admin.
    The Gemini call is offloaded to a thread with a 30-second timeout.
    """
    
    # 1. Fetch case with eager loaded anomalies and market data
    case = db.query(Case).options(
        joinedload(Case.anomalies).joinedload(Anomaly.market_data)
    ).filter(Case.id == case_id).first()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Check ownership (creator, assignee, or analyst)
    verify_case_access(case, current_user)
        
    # Extract necessary variables before closing the session
    anomalies_data = []
    for anomaly in case.anomalies:
        md = anomaly.market_data
        anomalies_data.append({
            "anomaly_id": anomaly.id,
            "anomaly_score": anomaly.anomaly_score,
            "anomaly_if": anomaly.isolation_forest_score,
            "anomaly_rf": anomaly.multi_pattern_max_score,
            "anomaly_features": anomaly.features,
            "md_symbol": md.symbol,
            "md_timestamp": md.timestamp.isoformat() if md.timestamp else None,
            "md_close": float(md.close) if md.close else None,
            "md_volume": float(md.volume) if md.volume else None,
        })
    
    # Sort anomalies chronologically
    anomalies_data.sort(key=lambda x: x["md_timestamp"])

    context_data = {
        "case_id": case.id,
        "case_title": case.title,
        "case_status": case.status,
        "case_created_at": case.created_at.isoformat() if case.created_at else None,
        "anomalies": anomalies_data
    }

    try:
        # Wait up to 10s to acquire the permit, rejecting if the queue is too long
        await asyncio.wait_for(mar_generation_semaphore.acquire(), timeout=10.0)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server is busy generating reports. Please try again later.",
        )

    try:
        # The thread enforces its own 30s timeout via the Gemini SDK,
        # ensuring the permit is held for the exact duration of the worker thread.
        report_md = await asyncio.to_thread(generate_mar, context_data)

        return PlainTextResponse(
            content=report_md,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename=MAR_Case_{case_id}.md"},
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        import logging
        logging.error("Error generating MAR report: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while generating the report."
        )
    finally:
        mar_generation_semaphore.release()
