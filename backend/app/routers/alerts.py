"""app/routers/alerts.py — Alert management endpoints."""
import logging
import threading

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth_policy import verify_ownership
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Alert, Anomaly, MarketData, User
from app.schemas import AlertCreate, AlertResponse, AlertUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
def create_alert(
    payload: AlertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an alert for an anomaly owned by the current user."""
    anomaly = (
        db.query(Anomaly)
        .join(MarketData, Anomaly.market_data_id == MarketData.id)
        .filter(Anomaly.id == payload.anomaly_id)
        .first()
    )
    if anomaly is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anomaly not found")
        
    # Verify the user owns the market data associated with the anomaly
    verify_ownership(anomaly.market_data, current_user)

    alert = Alert(
        anomaly_id=payload.anomaly_id,
        user_id=current_user.id,
        message=payload.message,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.get("", response_model=list[AlertResponse])
def list_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all alerts for the current user. (Admins see all for simplicity, or just their own?)
    Actually, list endpoints usually filter by the user themselves unless specified."""
    # List endpoints typically filter directly for the user unless admin
    if current_user.role == "admin":
        return db.query(Alert).all()
    return db.query(Alert).filter(Alert.user_id == current_user.id).all()


@router.get("/{alert_id}", response_model=AlertResponse)
def get_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch a single alert by ID."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    verify_ownership(alert, current_user)
    return alert


@router.patch("/{alert_id}", response_model=AlertResponse)
def update_alert(
    alert_id: int,
    payload: AlertUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update alert status or message."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    verify_ownership(alert, current_user)

    if payload.status is not None:
        alert.status = payload.status
    if payload.message is not None:
        alert.message = payload.message

    db.commit()
    db.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an alert."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    verify_ownership(alert, current_user)
    db.delete(alert)
    db.commit()


# ──────────────────────────────────────────────
# Streaming Endpoint (Phase 8)
# ──────────────────────────────────────────────
import asyncio
import json

from fastapi import Query
from fastapi.responses import StreamingResponse

# FIX-10: module-level SSE subscriber counter so the Prometheus gauge stays accurate
_current_subscriber_count: int = 0
_subscriber_count_lock = threading.Lock()


@router.get("/stream/live")
async def stream_live_alerts(
    token: str = Query(..., description="Short-lived SSE token from POST /auth/sse-token"),
):
    """
    Server-Sent Events (SSE) endpoint for live anomalies.

    Auth: requires a short-lived SSE token from POST /auth/sse-token
    (not the regular access token — SSE tokens are URL-safe and expire in 60s).

    Scope: only emits alerts for symbols the user has in any of their watchlists.
    The engine publishes all market anomalies; this endpoint filters them
    so each user only sees events relevant to what they're watching.
    
    Limitation: Watchlist symbols are cached at connection time. If a user adds
    or removes a symbol from their watchlist while connected, they will not see
    the change until they disconnect and reconnect.
    """
    from jose import JWTError
    from jose import jwt as jose_jwt

    from app.database import SessionLocal
    from app.models import Watchlist, WatchlistSymbol
    from app.services.redis_service import STREAM_ALERTS, get_async_redis

    # B1: Validate SSE-scoped token — reject regular access tokens
    try:
        payload = jose_jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_exp": True},
        )
        if payload.get("type") != "sse":
            raise JWTError("wrong token type")
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        from fastapi.responses import Response
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    # B2: Load the user's watchlist symbols using a short-lived session so we don't 
    # hold a DB connection from the pool for the entire duration of the SSE stream.
    db = SessionLocal()
    try:
        watchlist_symbols: set[str] = {
            row.symbol
            for row in db.query(WatchlistSymbol.symbol)
            .join(Watchlist, WatchlistSymbol.watchlist_id == Watchlist.id)
            .filter(Watchlist.user_id == user_id)
            .all()
        }
    finally:
        db.close()

    async def event_generator():
        global _current_subscriber_count
        from app.routers.telemetry import set_active_subscribers
        with _subscriber_count_lock:
            _current_subscriber_count += 1
            set_active_subscribers(_current_subscriber_count)
        try:
            client = get_async_redis()
            last_id = "$"
            
            # Send an initial ping to flush HTTP headers and trigger client onopen
            yield ": ping\n\n"

            # Replay recent alerts from the stream so the UI immediately shows recent surveillance activity
            try:
                recent_entries = await client.xrevrange(STREAM_ALERTS, count=25)
                if recent_entries:
                    for entry_id, fields in reversed(recent_entries):
                        data = json.loads(fields["data"])
                        if not watchlist_symbols:
                            pass  # empty watchlist — seeded at registration; user deliberately removed all symbols
                        elif data.get("symbol") in watchlist_symbols:
                            yield f"data: {fields['data']}\n\n"
            except Exception as e:
                logger.warning("Error replaying recent alerts for user_id=%s: %s", user_id, e)
            
            while True:
                try:
                    results = await client.xread({STREAM_ALERTS: last_id}, count=10, block=2000)
                    if results:
                        for _stream_name, entries in results:
                            for entry_id, fields in entries:
                                last_id = entry_id
                                data = json.loads(fields["data"])
                                # B2: Strict data isolation: only emit if the symbol is in this user's explicit watchlists.
                                if not watchlist_symbols:
                                    pass  # empty watchlist — deliberate (user removed all symbols after Option A seed)
                                elif data.get("symbol") in watchlist_symbols:
                                    yield f"data: {fields['data']}\n\n"
                    else:
                        # Keep-alive ping every 2 seconds when idle
                        yield ": ping\n\n"
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    # Log Redis failures instead of swallowing them silently
                    logger.error("SSE Redis read error for user_id=%s: %s", user_id, e)
                    await asyncio.sleep(2)
        finally:
            with _subscriber_count_lock:
                _current_subscriber_count -= 1
                set_active_subscribers(_current_subscriber_count)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
