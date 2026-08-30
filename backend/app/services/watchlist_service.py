
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.auth_policy import verify_ownership
from app.models import User, Watchlist, WatchlistSymbol
from app.schemas import WatchlistCreate, WatchlistSymbolAdd, WatchlistUpdate


# ──────────────────────────────────────────────
# Private helpers
# ──────────────────────────────────────────────
def _get_watchlist_or_404(db: Session, watchlist_id: int, current_user: User) -> Watchlist:
    """
    Fetch a watchlist by ID and verify ownership using the central policy.
    Raises 404 if not found.
    """
    wl = (
        db.query(Watchlist)
        .options(selectinload(Watchlist.symbols))
        .filter(Watchlist.id == watchlist_id)
        .first()
    )
    if wl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Watchlist not found")
        
    try:
        verify_ownership(wl, current_user)
    except HTTPException as e:
        if e.status_code == status.HTTP_403_FORBIDDEN:
            # Mask the 403 as a 404 to prevent resource enumeration
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Watchlist not found") from e
        raise
        
    return wl


# ──────────────────────────────────────────────
# Watchlist CRUD
# ──────────────────────────────────────────────
def create_watchlist(db: Session, user_id: int, payload: WatchlistCreate) -> Watchlist:
    """
    Create a new watchlist for a user.
    Returns 409 if the user already has a watchlist with this name.
    """
    existing = db.query(Watchlist).filter(
        Watchlist.user_id == user_id,
        Watchlist.name == payload.name,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Watchlist named '{payload.name}' already exists",
        )

    wl = Watchlist(
        user_id=user_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return wl


def get_watchlist(db: Session, watchlist_id: int, current_user: User) -> Watchlist:
    """Get a single watchlist with all its symbols."""
    return _get_watchlist_or_404(db, watchlist_id, current_user)


def list_watchlists(db: Session, user_id: int) -> list[Watchlist]:
    """
    List all watchlists for a user.
    Uses selectinload to avoid N+1 when rendering symbol counts.
    """
    return (
        db.query(Watchlist)
        .options(selectinload(Watchlist.symbols))
        .filter(Watchlist.user_id == user_id)
        .order_by(Watchlist.created_at.desc())
        .all()
    )


def update_watchlist(
    db: Session,
    watchlist_id: int,
    current_user: User,
    payload: WatchlistUpdate,
) -> Watchlist:
    """
    Update watchlist name and/or description.
    Returns 409 if the new name conflicts with another watchlist.
    """
    wl = _get_watchlist_or_404(db, watchlist_id, current_user)

    if payload.name is not None and payload.name != wl.name:
        # Check name uniqueness for this user
        conflict = db.query(Watchlist).filter(
            Watchlist.user_id == current_user.id,
            Watchlist.name == payload.name,
            Watchlist.id != watchlist_id,
        ).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Watchlist named '{payload.name}' already exists",
            )
        wl.name = payload.name

    if payload.description is not None:
        wl.description = payload.description

    db.commit()
    db.refresh(wl)
    return wl


def delete_watchlist(db: Session, watchlist_id: int, current_user: User) -> None:
    """Delete a watchlist and all its symbols (cascade)."""
    wl = _get_watchlist_or_404(db, watchlist_id, current_user)
    db.delete(wl)
    db.commit()


# ──────────────────────────────────────────────
# Symbol management inside a watchlist
# ──────────────────────────────────────────────
def add_symbol(
    db: Session,
    watchlist_id: int,
    current_user: User,
    payload: WatchlistSymbolAdd,
) -> WatchlistSymbol:
    """
    Add a symbol to a watchlist.
    Returns 409 if symbol already in this watchlist.
    """
    wl = _get_watchlist_or_404(db, watchlist_id, current_user)

    existing = db.query(WatchlistSymbol).filter(
        WatchlistSymbol.watchlist_id == wl.id,
        WatchlistSymbol.symbol == payload.symbol,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Symbol '{payload.symbol}' already in watchlist",
        )

    ws = WatchlistSymbol(
        watchlist_id=wl.id,
        symbol=payload.symbol,
        notes=payload.notes,
    )
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return ws


def remove_symbol(
    db: Session,
    watchlist_id: int,
    symbol: str,
    current_user: User,
) -> None:
    """Remove a symbol from a watchlist."""
    wl = _get_watchlist_or_404(db, watchlist_id, current_user)

    ws = db.query(WatchlistSymbol).filter(
        WatchlistSymbol.watchlist_id == wl.id,
        WatchlistSymbol.symbol == symbol.upper(),
    ).first()
    if ws is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Symbol '{symbol}' not in watchlist",
        )

    db.delete(ws)
    db.commit()


# ──────────────────────────────────────────────
# Registration helper — default watchlist seed
# ──────────────────────────────────────────────

# Symbols every new user's default watchlist is pre-seeded with.
# Matches the DEFAULT_SYMBOLS list in market_data.py's get_correlation_matrix.
DEFAULT_WATCHLIST_SYMBOLS: list[str] = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",  # crypto
    "AAPL", "TSLA", "NVDA",                        # US equities
]


def seed_default_watchlist(db: Session, user_id: int) -> Watchlist:
    """Create a default "My Watchlist" with a sensible starter symbol set for a new user.

    Called immediately after user creation in the /auth/register endpoint.
    Ensures no new user hits the SSE stream with an empty watchlist — which
    would make the stream permanently silent with no visible explanation.

    Idempotent: if the user already has a watchlist named "My Watchlist"
    (should never happen at registration, but safe to call elsewhere), returns
    the existing one rather than raising a 409.
    """
    existing = db.query(Watchlist).filter(
        Watchlist.user_id == user_id,
        Watchlist.name == "My Watchlist",
    ).first()

    if existing is None:
        wl = Watchlist(
            user_id=user_id,
            name="My Watchlist",
            description="Your default surveillance watchlist, pre-seeded with common symbols.",
        )
        db.add(wl)
        db.flush()  # get wl.id without committing
    else:
        wl = existing

    # Bulk-insert symbols, skip any already present
    existing_symbols: set[str] = {
        row.symbol
        for row in db.query(WatchlistSymbol.symbol)
        .filter(WatchlistSymbol.watchlist_id == wl.id)
        .all()
    }
    for symbol in DEFAULT_WATCHLIST_SYMBOLS:
        if symbol not in existing_symbols:
            db.add(WatchlistSymbol(watchlist_id=wl.id, symbol=symbol))

    db.commit()
    db.refresh(wl)
    return wl
