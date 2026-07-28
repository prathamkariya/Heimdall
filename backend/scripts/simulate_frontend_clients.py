"""scripts/simulate_frontend_clients.py — SSE Connection Load Tester.

Simulates hundreds of concurrent browser clients connected to the live alerts
SSE stream. Used to validate Nginx connection limits, Uvicorn worker capacity,
and ensure no clients are silently dropped under high concurrency.

Usage:
    # Requires the API to be running (docker compose up api redis db):
    python backend/scripts/simulate_frontend_clients.py

    # Custom concurrency and duration:
    python backend/scripts/simulate_frontend_clients.py --clients 500 --duration 60

    # Against Docker load-test stack:
    python backend/scripts/simulate_frontend_clients.py \\
        --base-url http://localhost:8000 --clients 500 --duration 60
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from dataclasses import dataclass, field

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("sse_load_tester")


@dataclass
class ClientStats:
    connected: int = 0
    dropped: int = 0
    events_received: int = 0
    errors: list[str] = field(default_factory=list)


async def _register_and_login(client: httpx.AsyncClient, base_url: str, idx: int) -> str | None:
    """Register a throwaway test user and return a JWT token."""
    email = f"load_test_user_{idx}_{int(time.time())}@example.com"
    password = "LoadTest@1234"
    username = f"lt_user_{idx}_{int(time.time())}"
    try:
        await client.post(f"{base_url}/api/v1/auth/register", json={
            "email": email, "username": username, "password": password,
        }, timeout=10)
        resp = await client.post(f"{base_url}/api/v1/auth/login", json={
            "email": email, "password": password,
        }, timeout=10)
        resp.raise_for_status()
        return resp.json()["access_token"]
    except Exception:
        return None


async def _get_sse_token(client: httpx.AsyncClient, base_url: str, jwt_token: str) -> str | None:
    """Exchange a JWT for a short-lived SSE token."""
    try:
        resp = await client.post(
            f"{base_url}/api/v1/auth/sse-token",
            headers={"Authorization": f"Bearer {jwt_token}"},
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json().get("sse_token")
        return None
    except Exception:
        return None


async def _sse_client(
    base_url: str,
    client_id: int,
    duration: int,
    stats: ClientStats,
) -> None:
    """Single SSE client: authenticate, connect, and count events for `duration` seconds."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(duration + 30)) as http:
        jwt = await _register_and_login(http, base_url, client_id)
        if not jwt:
            stats.dropped += 1
            stats.errors.append(f"Client {client_id}: auth failed")
            return

        sse_token = await _get_sse_token(http, base_url, jwt)
        if not sse_token:
            stats.dropped += 1
            stats.errors.append(f"Client {client_id}: SSE token exchange failed")
            return

        stats.connected += 1
        deadline = time.monotonic() + duration
        url = f"{base_url}/api/v1/alerts/stream/live?token={sse_token}"

        try:
            async with http.stream("GET", url, timeout=duration + 10) as resp:
                if resp.status_code != 200:
                    stats.dropped += 1
                    stats.errors.append(f"Client {client_id}: HTTP {resp.status_code}")
                    return
                async for line in resp.aiter_lines():
                    if time.monotonic() > deadline:
                        break
                    if line.startswith("data:"):
                        stats.events_received += 1
        except httpx.ReadTimeout:
            pass  # Expected — client reached its duration limit
        except Exception as e:
            stats.dropped += 1
            stats.errors.append(f"Client {client_id}: {type(e).__name__}: {e}")


async def _run(base_url: str, num_clients: int, duration: int, ramp_seconds: int) -> None:
    stats = ClientStats()
    delay_per_client = ramp_seconds / max(num_clients, 1)

    logger.info(
        "🌐 SSE Load Tester | clients=%d | duration=%ds | ramp=%ds | target=%s",
        num_clients, duration, ramp_seconds, base_url,
    )

    tasks = []
    for i in range(num_clients):
        tasks.append(asyncio.create_task(_sse_client(base_url, i, duration, stats)))
        if delay_per_client > 0:
            await asyncio.sleep(delay_per_client)

    # Wait for all clients to finish
    await asyncio.gather(*tasks, return_exceptions=True)

    logger.info("=" * 60)
    logger.info("SSE LOAD TEST RESULTS")
    logger.info("=" * 60)
    logger.info("  Clients attempted : %d", num_clients)
    logger.info("  Successfully connected : %d", stats.connected)
    logger.info("  Dropped/errored  : %d", stats.dropped)
    logger.info("  Total SSE events received : %d", stats.events_received)
    if stats.errors:
        logger.warning("  Sample errors (first 10):")
        for err in stats.errors[:10]:
            logger.warning("    - %s", err)
    success_rate = (stats.connected / num_clients * 100) if num_clients else 0
    logger.info("  Connection success rate: %.1f%%", success_rate)

    if success_rate < 95:
        logger.error("❌ FAIL: Connection success rate %.1f%% is below 95%% threshold!", success_rate)
        sys.exit(1)
    else:
        logger.info("✅ PASS: %.1f%% of clients connected and held stable.", success_rate)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Market Surveillance SSE Connection Load Tester")
    p.add_argument("--clients",   type=int, default=100,   help="Number of concurrent SSE clients (default: 100)")
    p.add_argument("--duration",  type=int, default=30,    help="How long each client holds the connection (default: 30s)")
    p.add_argument("--ramp",      type=int, default=5,     help="Seconds over which to ramp up connections (default: 5)")
    p.add_argument("--base-url",  default=os.getenv("API_URL", "http://localhost:8000"),
                   help="Base URL of the FastAPI app")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    asyncio.run(_run(args.base_url, args.clients, args.duration, args.ramp))
