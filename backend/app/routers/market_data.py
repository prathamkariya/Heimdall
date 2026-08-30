"""app/routers/market_data.py — OHLCV market data endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth_policy import verify_ownership
from app.database import get_db
from app.dependencies import get_current_user
from app.models import MarketData, User
from app.schemas import MarketDataCreate, MarketDataResponse

router = APIRouter(prefix="/market-data", tags=["market-data"])


@router.post("", response_model=MarketDataResponse, status_code=status.HTTP_201_CREATED)
def create_market_data(
    payload: MarketDataCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ingest one OHLCV candle for the authenticated user.

    NOTE: MarketData's uniqueness is enforced per-user via the
    uq_market_data_user_symbol_timestamp constraint. Collisions
    return a 409 Conflict.
    """
    def infer_market(symbol: str) -> str:
        symbol_upper = symbol.upper()
        # Crypto: typically ends in USDT, BTC, ETH, or contains a hyphen/slash
        if any(suffix in symbol_upper for suffix in ["USDT", "BTC", "ETH", "-", "/"]):
            return "CRYPTO"
        # Fallback/Equities: US Equities
        return "US_EQUITY"

    record = MarketData(
        user_id=current_user.id,
        symbol=payload.symbol,
        timestamp=payload.timestamp,
        open=payload.open,
        high=payload.high,
        low=payload.low,
        close=payload.close,
        volume=payload.volume,
        market=infer_market(payload.symbol),
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        if "uq_market_data_user_symbol_timestamp" in str(e.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Market data for {payload.symbol} at {payload.timestamp} already exists.",
            ) from e
        raise
    db.refresh(record)
    return record


@router.get("", response_model=list[MarketDataResponse])
def list_market_data(
    symbol: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List OHLCV records for the authenticated user or system user, optionally filtered by symbol."""
    system_user = db.query(User).filter(User.role == "system").first()
    system_user_id = system_user.id if system_user else None

    query = db.query(MarketData).filter(
        or_(
            MarketData.user_id == current_user.id,
            MarketData.user_id == system_user_id
        )
    )
    if symbol:
        query = query.filter(MarketData.symbol == symbol.upper())
    return query.order_by(MarketData.timestamp.desc()).limit(limit).all()


@router.get("/correlation")
def get_correlation_matrix(
    symbols: str | None = None,
    limit: int = 60,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compute the Pearson correlation matrix for a set of symbols.

    Query params:
      symbols: comma-separated list of symbols (default: all tracked symbols)
      limit:   number of recent candles to use per symbol (default 60 ≈ 1h of 1m bars)

    Returns:
      { "symbols": [...], "matrix": [[...], ...], "sample_count": N }
    """
    import math

    DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'AAPL', 'TSLA', 'NVDA']
    target_symbols = [s.strip().upper() for s in symbols.split(',')] if symbols else DEFAULT_SYMBOLS

    # Fetch close prices for each symbol
    prices: dict[str, list[float]] = {}
    for sym in target_symbols:
        alt_syms = {sym, sym.replace('-', ''), sym.replace('/', ''), sym.replace('_', '')}
        rows = (
            db.query(MarketData.close)
            .filter(MarketData.symbol.in_(alt_syms))
            .order_by(MarketData.timestamp.desc())
            .limit(limit)
            .all()
        )
        if rows:
            prices[sym] = [float(r.close) for r in reversed(rows) if r.close is not None]

    available = [s for s in target_symbols if s in prices and len(prices[s]) >= 3]
    if len(available) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Insufficient market data. Need at least 2 symbols with >= 3 data points each.",
        )

    def pearson(xs: list[float], ys: list[float]) -> float:
        n = min(len(xs), len(ys))
        if n < 3:
            return 0.0
        xs, ys = xs[-n:], ys[-n:]
        mx = sum(xs) / n
        my = sum(ys) / n
        num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
        dy = math.sqrt(sum((y - my) ** 2 for y in ys))
        if dx == 0 or dy == 0:
            return 0.0
        return round(num / (dx * dy), 4)

    matrix = [
        [pearson(prices[a], prices[b]) for b in available]
        for a in available
    ]

    return {
        "symbols": available,
        "matrix": matrix,
        "sample_count": limit,
    }


@router.get("/{record_id}", response_model=MarketDataResponse)
def get_market_data(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch a single OHLCV record by ID."""
    system_user = db.query(User).filter(User.role == "system").first()
    system_user_id = system_user.id if system_user else None

    record = db.query(MarketData).filter(
        MarketData.id == record_id,
        or_(
            MarketData.user_id == current_user.id,
            MarketData.user_id == system_user_id
        )
    ).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_market_data(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a single OHLCV record."""
    record = db.query(MarketData).filter(MarketData.id == record_id).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    verify_ownership(record, current_user)
    db.delete(record)
    db.commit()
