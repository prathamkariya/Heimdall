import logging
import time
import traceback

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session

import app.alias
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.routers import alerts, anomaly, auth, cases, market_data, reports, search, watchlists

app = FastAPI(
    title="Market Surveillance & Anomaly Detection",
    description="Production-grade API for detecting market manipulation patterns.",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

logger = logging.getLogger("market_surveillance.errors")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler that logs full diagnostic context server-side
    without leaking stack traces or internal detail to API clients.

    Logs: timestamp, endpoint, request_id header (if present),
    authenticated user id (if present), exception type and message,
    and the full stack trace.
    """
    # Never interfere with HTTPExceptions — FastAPI's own handler covers those.
    if isinstance(exc, HTTPException):
        raise exc

    request_id = request.headers.get("X-Request-ID", "n/a")
    user_id = getattr(getattr(request.state, "user", None), "id", "unauthenticated")

    logger.error(
        "Unhandled exception",
        extra={
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "endpoint": str(request.url),
            "method": request.method,
            "request_id": request_id,
            "user_id": str(user_id),
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "traceback": traceback.format_exc(),
        },
    )

    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."},
    )

# ──────────────────────────────────────────────
# Middleware
# ──────────────────────────────────────────────
# B8: allow_origins=["*"] + allow_credentials=True is invalid per the CORS spec
# (browsers reject it). Use the explicit origin list from settings instead.
_allowed_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# Routers
# ──────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(market_data.router, prefix=API_PREFIX)
app.include_router(anomaly.router, prefix=API_PREFIX)
app.include_router(alerts.router, prefix=API_PREFIX)
app.include_router(watchlists.router, prefix=API_PREFIX)   # Phase 2
app.include_router(reports.router, prefix=API_PREFIX)
app.include_router(search.router, prefix=API_PREFIX)
app.include_router(cases.router, prefix=API_PREFIX)

# ──────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health_check(db: Session = Depends(get_db)):
    """Live health check — pings the database so it reflects actual system state.
    Returns 200 ok when the DB is reachable, 503 degraded when it isn't.
    A static dict here would report 'ok' through a full DB outage.
    """
    from sqlalchemy import text
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "version": "2.0.0"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "version": "2.0.0", "detail": str(e)},
        )


@app.get("/health/models", tags=["health"])
def models_health_check():
    """Live telemetry on ML model registries, active detector patterns, and feature configurations."""
    from app.services.anomaly_service import get_models_health_status
    return get_models_health_status()
