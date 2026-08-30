"""app/routers/reports.py"""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session, joinedload

from app.auth_policy import verify_case_access
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Anomaly, Case, CaseNote, User
from app.services.mar_generator import generate_mar

router = APIRouter(prefix="/reports", tags=["Reports"])

# Limit concurrent Gemini generation requests to avoid exhausting workers/rate limits.
# Configurable via MAR_MAX_CONCURRENCY env variable (default: 5).
mar_generation_semaphore = asyncio.BoundedSemaphore(settings.MAR_MAX_CONCURRENCY)

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
        joinedload(Case.anomalies).joinedload(Anomaly.market_data),
        joinedload(Case.notes).joinedload(CaseNote.author),
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

    # FIX-16: include analyst notes in the generation context
    notes_data = [
        {
            "author": note.author.username if note.author else "unknown",
            "created_at": note.created_at.isoformat() if note.created_at else None,
            "body": note.body,
        }
        for note in sorted(case.notes, key=lambda n: (n.created_at or ""))
    ]

    context_data = {
        "case_id": case.id,
        "case_title": case.title,
        "case_status": case.status,
        "case_created_at": case.created_at.isoformat() if case.created_at else None,
        "anomalies": anomalies_data,
        "notes": notes_data,
    }

    try:
        # Wait up to 10s to acquire the permit, rejecting if the queue is too long
        await asyncio.wait_for(mar_generation_semaphore.acquire(), timeout=10.0)
    except asyncio.TimeoutError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server is busy generating reports. Please try again later.",
        ) from e

    try:
        # Wrap the Gemini call with a hard timeout so a hung LLM request
        # cannot hold the semaphore permit and block worker threads indefinitely.
        # Timeout is configurable via MAR_GENERATION_TIMEOUT_SECONDS (default: 30s).
        report_md = await asyncio.wait_for(
            asyncio.to_thread(generate_mar, context_data),
            timeout=settings.MAR_GENERATION_TIMEOUT_SECONDS,
        )

        return PlainTextResponse(
            content=report_md,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename=MAR_Case_{case_id}.md"},
        )
    except asyncio.TimeoutError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Report generation timed out. Please try again later.",
        ) from e
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        import logging
        logging.error("Error generating MAR report: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while generating the report."
        ) from e
    finally:
        mar_generation_semaphore.release()
