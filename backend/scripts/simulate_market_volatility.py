"""scripts/simulate_market_volatility.py — Redis Stream Load Tester.

Simulates a high-velocity market data ingestion event by pumping synthetic
trade ticks directly into the 'live_trades' Redis stream at a configurable rate.

This does NOT hit the HTTP API. It writes directly to Redis exactly as the
real market adapter workers do, giving an accurate picture of ML Engine load.

Usage:
    # From the project root (requires redis running):
    python backend/scripts/simulate_market_volatility.py

    # Custom rate / duration:
    python backend/scripts/simulate_market_volatility.py --rate 5000 --duration 60

    # Via Docker (for the load-test stack):
    docker compose -f docker-compose.load.yml run --rm spammer \\
        python scripts/simulate_market_volatility.py --rate 10000 --duration 120
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import time

import redis.asyncio as aioredis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("load_spammer")

STREAM_TRADES = "live_trades"
STREAM_MAXLEN = 200_000  # Approximate cap — prevents OOM even at extreme rates

SYMBOLS = ["BTCUSDT", "ETHUSDT", "AAPL", "TSLA", "RELIANCE", "INFY", "SOLUSDT", "BNBUSDT"]
MARKETS = ["crypto", "us_equity", "india_equity"]
SOURCES = ["binance", "alpaca", "upstox"]

SYMBOL_MARKET_MAP = {
    "BTCUSDT": ("crypto", "binance"),
    "ETHUSDT": ("crypto", "binance"),
    "SOLUSDT": ("crypto", "binance"),
    "BNBUSDT": ("crypto", "binance"),
    "AAPL":    ("us_equity", "alpaca"),
    "TSLA":    ("us_equity", "alpaca"),
    "RELIANCE":("india_equity", "upstox"),
    "INFY":    ("india_equity", "upstox"),
}


def _make_tick(t: float) -> dict:
    """Generate a realistic synthetic trade tick."""
    symbol = random.choice(SYMBOLS)
    market, source = SYMBOL_MARKET_MAP[symbol]
    base_price = {
        "BTCUSDT": 65000, "ETHUSDT": 3200, "SOLUSDT": 145, "BNBUSDT": 580,
        "AAPL": 195, "TSLA": 250, "RELIANCE": 2900, "INFY": 1600,
    }[symbol]
    price = round(base_price * (1 + random.gauss(0, 0.002)), 4)
    # Occasionally inject a pump-and-dump-like volume spike for realism
    volume_multiplier = 50 if random.random() < 0.005 else 1.0
    volume = round(random.uniform(0.1, 10.0) * volume_multiplier, 4)
    return {
        "symbol": symbol,
        "market": market,
        "source": source,
        "price": price,
        "volume": volume,
        "timestamp_ms": int(t * 1000),
    }


async def _pump(redis_url: str, rate: int, duration: int) -> None:
    """Main pump loop: fire ticks at `rate` per second for `duration` seconds."""
    client = aioredis.from_url(redis_url, decode_responses=True)
    interval = 1.0 / rate  # seconds per tick
    deadline = time.monotonic() + duration
    total_sent = 0
    batch_size = min(rate, 500)  # pipeline writes in batches of up to 500
    start = time.monotonic()

    logger.info(
        "🚀 Load spammer starting | rate=%d ticks/s | duration=%ds | stream=%s",
        rate, duration, STREAM_TRADES,
    )

    while time.monotonic() < deadline:
        batch_start = time.monotonic()
        pipe = client.pipeline(transaction=False)
        now = time.time()
        for _ in range(batch_size):
            tick = _make_tick(now)
            pipe.xadd(STREAM_TRADES, {"data": json.dumps(tick)}, maxlen=STREAM_MAXLEN, approximate=True)
        await pipe.execute()
        total_sent += batch_size

        # Throttle: sleep for the remainder of the batch window
        elapsed = time.monotonic() - batch_start
        batch_window = interval * batch_size
        sleep_time = batch_window - elapsed
        if sleep_time > 0:
            await asyncio.sleep(sleep_time)

        # Progress report every 5 seconds
        wall_elapsed = time.monotonic() - start
        if int(wall_elapsed) % 5 == 0 and int(wall_elapsed) > 0:
            actual_rate = total_sent / wall_elapsed
            pending_info = await client.xpending(STREAM_TRADES, "engine_group") if True else {}
            backlog = pending_info.get("pending", "?") if isinstance(pending_info, dict) else "?"
            logger.info(
                "📊 Progress | sent=%d | actual_rate=%.0f/s | engine_backlog=%s",
                total_sent, actual_rate, backlog,
            )

    wall_elapsed = time.monotonic() - start
    logger.info(
        "✅ Load test complete | total_sent=%d | avg_rate=%.0f ticks/s | duration=%.1fs",
        total_sent, total_sent / wall_elapsed, wall_elapsed,
    )
    await client.aclose()


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Market Surveillance Redis Load Spammer")
    p.add_argument("--rate",     type=int, default=1000,  help="Target ticks per second (default: 1000)")
    p.add_argument("--duration", type=int, default=30,    help="Duration in seconds (default: 30)")
    p.add_argument("--redis-url", default=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
                   help="Redis connection URL")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    asyncio.run(_pump(args.redis_url, args.rate, args.duration))
