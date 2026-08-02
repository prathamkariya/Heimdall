"""app/routers/telemetry.py — Prometheus metrics and system telemetry.

Exposes:
  GET /metrics  — Prometheus text/plain scrape endpoint
  GET /api/v1/telemetry/status  — JSON health summary
  GET /api/v1/market-data/correlation — Rolling correlation matrix between tracked symbols

Metrics exported:
  heimdall_http_requests_total{endpoint, method, status_code}
  heimdall_http_request_duration_seconds{endpoint}
  heimdall_anomalies_detected_total{market, pattern, severity}
  heimdall_active_stream_subscribers (gauge, SSE subscriber estimate)
  heimdall_ingestion_processed_total{market}
"""
import time
import threading
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Anomaly, MarketData, User

router = APIRouter(tags=["Telemetry"])

# ──────────────────────────────────────────────
# In-process metric stores (thread-safe counters)
# ──────────────────────────────────────────────
_lock = threading.Lock()

# Counters: key → count
_request_counters: dict[tuple, int] = defaultdict(int)
_anomaly_counters: dict[tuple, int] = defaultdict(int)
_ingestion_counters: dict[str, int] = defaultdict(int)

# Histograms: key → list of durations (seconds)
_duration_samples: dict[str, list[float]] = defaultdict(list)

# Gauges
_active_subscribers: int = 0

START_TIME = time.time()


def record_request(endpoint: str, method: str, status_code: int, duration_s: float) -> None:
    """Call from middleware or route handlers to record an HTTP request."""
    with _lock:
        key = (endpoint, method, str(status_code))
        _request_counters[key] += 1
        _duration_samples[endpoint].append(duration_s)
        # Keep last 1000 samples per endpoint to avoid unbounded growth
        if len(_duration_samples[endpoint]) > 1000:
            _duration_samples[endpoint] = _duration_samples[endpoint][-1000:]


def record_anomaly(market: str, pattern: str, severity: str) -> None:
    """Call from anomaly detection pipeline when an anomaly is committed."""
    with _lock:
        key = (market, pattern, severity)
        _anomaly_counters[key] += 1


def record_ingestion(market: str, count: int = 1) -> None:
    """Call from ingestion workers when ticks are processed."""
    with _lock:
        _ingestion_counters[market] += count


def set_active_subscribers(n: int) -> None:
    global _active_subscribers
    with _lock:
        _active_subscribers = n


def _histogram_percentile(samples: list[float], p: float) -> float:
    if not samples:
        return 0.0
    sorted_s = sorted(samples)
    idx = max(0, int(len(sorted_s) * p / 100) - 1)
    return sorted_s[idx]


def _build_prometheus_output() -> str:
    lines = []
    uptime = time.time() - START_TIME

    with _lock:
        req_snap = dict(_request_counters)
        anom_snap = dict(_anomaly_counters)
        ing_snap = dict(_ingestion_counters)
        dur_snap = {k: list(v) for k, v in _duration_samples.items()}
        subs = _active_subscribers

    # ── heimdall_up ──
    lines.append('# HELP heimdall_up Platform uptime in seconds')
    lines.append('# TYPE heimdall_up gauge')
    lines.append(f'heimdall_up {uptime:.1f}')

    # ── HTTP request counter ──
    lines.append('')
    lines.append('# HELP heimdall_http_requests_total Total HTTP requests handled')
    lines.append('# TYPE heimdall_http_requests_total counter')
    for (endpoint, method, sc), count in req_snap.items():
        safe_ep = endpoint.replace('"', '\\"')
        lines.append(f'heimdall_http_requests_total{{endpoint="{safe_ep}",method="{method}",status_code="{sc}"}} {count}')

    # ── HTTP request duration histogram (p50, p95, p99) ──
    lines.append('')
    lines.append('# HELP heimdall_http_request_duration_p95_seconds P95 request duration in seconds')
    lines.append('# TYPE heimdall_http_request_duration_p95_seconds gauge')
    for endpoint, samples in dur_snap.items():
        safe_ep = endpoint.replace('"', '\\"')
        p95 = _histogram_percentile(samples, 95)
        lines.append(f'heimdall_http_request_duration_p95_seconds{{endpoint="{safe_ep}"}} {p95:.4f}')

    # ── Anomaly counter ──
    lines.append('')
    lines.append('# HELP heimdall_anomalies_detected_total Total anomalies detected by ML pipeline')
    lines.append('# TYPE heimdall_anomalies_detected_total counter')
    for (market, pattern, severity), count in anom_snap.items():
        lines.append(
            f'heimdall_anomalies_detected_total{{market="{market}",pattern="{pattern}",severity="{severity}"}} {count}'
        )

    # ── Ingestion counter ──
    lines.append('')
    lines.append('# HELP heimdall_ingestion_processed_total Total market data ticks ingested')
    lines.append('# TYPE heimdall_ingestion_processed_total counter')
    for market, count in ing_snap.items():
        lines.append(f'heimdall_ingestion_processed_total{{market="{market}"}} {count}')

    # ── Active SSE subscribers ──
    lines.append('')
    lines.append('# HELP heimdall_active_stream_subscribers Active SSE subscriber connections (estimate)')
    lines.append('# TYPE heimdall_active_stream_subscribers gauge')
    lines.append(f'heimdall_active_stream_subscribers {subs}')

    lines.append('')  # trailing newline
    return '\n'.join(lines)


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────

@router.get("/metrics", response_class=PlainTextResponse, tags=["Telemetry"])
def prometheus_metrics():
    """Prometheus scrape endpoint.

    Returns metrics in the standard Prometheus text/plain exposition format.
    Can be scraped by Prometheus, Grafana Agent, or any compatible collector.
    No authentication required — intended to be network-restricted at the
    infrastructure level (not exposed to the public internet).
    """
    return PlainTextResponse(
        content=_build_prometheus_output(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@router.get("/api/v1/telemetry/status", tags=["Telemetry"])
def telemetry_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """JSON summary of platform health for the dashboard.

    Returns:
      - Anomaly counts by market (last 24h from DB)
      - Market data ingestion counts (last 24h from DB)
      - Uptime seconds
      - Active subscriber estimate
    """
    from datetime import datetime, timedelta, timezone as tz
    cutoff = datetime.now(tz.utc) - timedelta(hours=24)

    try:
        anomaly_counts = (
            db.query(Anomaly.market_data.has(), func.count(Anomaly.id))  # type: ignore[attr-defined]
            .filter(Anomaly.detected_at >= cutoff)
            .group_by(text("1"))
            .all()
        )
    except Exception:
        anomaly_counts = []

    try:
        md_counts_raw = (
            db.query(MarketData.market, func.count(MarketData.id))
            .filter(MarketData.timestamp >= cutoff)
            .group_by(MarketData.market)
            .all()
        )
        md_counts = {market: count for market, count in md_counts_raw}
    except Exception:
        md_counts = {}

    with _lock:
        subs = _active_subscribers

    return {
        "uptime_seconds": round(time.time() - START_TIME),
        "active_subscribers": subs,
        "market_data_last_24h": md_counts,
        "anomalies_last_24h": len(anomaly_counts),
    }


@router.get("/api/v1/market-data/correlation", tags=["Telemetry"])
def get_correlation_matrix(
    symbols: Optional[str] = None,
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

    The matrix is symmetric. matrix[i][j] is the Pearson r between
    the close prices of symbols[i] and symbols[j] over the last `limit` candles.
    Values range from -1 (perfect inverse) to +1 (perfect positive).
    """
    import math

    DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'AAPL', 'TSLA', 'NVDA']
    target_symbols = [s.strip().upper() for s in symbols.split(',')] if symbols else DEFAULT_SYMBOLS

    # Fetch close prices for each symbol
    prices: dict[str, list[float]] = {}
    for sym in target_symbols:
        rows = (
            db.query(MarketData.close)
            .filter(MarketData.symbol == sym)
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
            detail="Insufficient market data. Need at least 2 symbols with ≥3 data points each.",
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
