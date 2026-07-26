from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings


# ──────────────────────────────────────────────
# Engine
# ──────────────────────────────────────────────
engine = create_engine(
    settings.DATABASE_URL,
    # Pool settings: tuned for production-level concurrency.
    # pool_size + max_overflow = maximum simultaneous DB connections.
    # With Uvicorn workers=4 and FastAPI's async model, 20+40=60 concurrent
    # connections is sufficient even under heavy load-test conditions.
    pool_size=100,         # Connections kept alive in the pool
    max_overflow=200,      # Extra connections created on demand when pool is full
    pool_timeout=30,       # Seconds to wait for a free connection before raising
    pool_recycle=1800,     # Recycle connections every 30 minutes to avoid stale TCP
    pool_pre_ping=True,    # Test connections before handing out (avoids stale conn errors)
    echo=settings.DEBUG,   # Log SQL in development only
)

# ──────────────────────────────────────────────
# Session factory
# ──────────────────────────────────────────────
SessionLocal = sessionmaker(
    autocommit=False,   # We control commits explicitly
    autoflush=False,    # We control flushes explicitly
    bind=engine,
)

# ──────────────────────────────────────────────
# Declarative base — all models inherit from this
# ──────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ──────────────────────────────────────────────
# FastAPI dependency
# ──────────────────────────────────────────────
def get_db():
    """
    Yield a database session for the duration of a request.

    The finally block guarantees db.close() runs even if the
    route handler raises an exception — preventing connection leaks.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
