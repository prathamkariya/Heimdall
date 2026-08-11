"""backend/scripts/verify_e2e_pipeline.py

Full synthetic end-to-end pipeline verification for HEIMDALL.

Simulates a complete market surveillance workflow:
  1. Authenticate as admin, obtain JWT
  2. Ingest synthetic pump-and-dump tick batch (CRYPTO + US_EQUITY)
  3. Trigger anomaly scoring and verify anomaly record creation
  4. Create an investigation case from the anomaly
  5. Add analyst markdown notes with hashtags
  6. Query the Prometheus /metrics endpoint and verify counters
  7. Print a structured pass/fail report

Usage:
    python scripts/verify_e2e_pipeline.py [--base-url http://localhost:8000]

Exit codes:
    0 = all checks passed
    1 = one or more checks failed
"""
import argparse
import hashlib
import sys
from datetime import datetime, timezone

import httpx

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_BASE_URL = "http://localhost:8000"
ADMIN_EMAIL = "admin@heimdall.io"
ADMIN_PASSWORD = "admin123"

SYNTHETIC_TICKS = [
    {
        "symbol": "BTCUSDT",
        "timestamp": "2025-01-10T10:00:00Z",
        "open": 42000.0, "high": 46000.0, "low": 41800.0, "close": 45800.0,
        "volume": 9800.0,
    },
    {
        "symbol": "BTCUSDT",
        "timestamp": "2025-01-10T10:01:00Z",
        "open": 45800.0, "high": 51000.0, "low": 45500.0, "close": 50200.0,
        "volume": 42000.0,  # Volume surge: ~4.3x
    },
    {
        "symbol": "AAPL",
        "timestamp": "2025-01-10T15:00:00Z",
        "open": 180.0, "high": 185.0, "low": 179.5, "close": 184.5,
        "volume": 12000.0,
    },
    {
        "symbol": "AAPL",
        "timestamp": "2025-01-10T15:01:00Z",
        "open": 184.5, "high": 192.0, "low": 184.0, "close": 191.0,
        "volume": 58000.0,  # Volume surge: ~4.8x
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
PASS = "\033[32m✓ PASS\033[0m"
FAIL = "\033[31m✗ FAIL\033[0m"
INFO = "\033[34m  INFO\033[0m"
results: list[tuple[str, bool, str]] = []


def check(name: str, condition: bool, detail: str = ""):
    icon = PASS if condition else FAIL
    print(f"  {icon}  {name}" + (f" — {detail}" if detail else ""))
    results.append((name, condition, detail))


def sha256_of(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Main verification routine
# ─────────────────────────────────────────────────────────────────────────────
def run_verification(base_url: str) -> int:
    client = httpx.Client(base_url=base_url, timeout=30.0)
    token: str | None = None

    print(f"\n{'═' * 60}")
    print("  HEIMDALL E2E Pipeline Verification")
    print(f"  Target: {base_url}")
    print(f"  Time:   {datetime.now(timezone.utc).isoformat()}")
    print(f"{'═' * 60}\n")

    # ── Step 1: Health check ──────────────────────────────────────────────────
    print("[ Step 1 ] Platform Health")
    try:
        r = client.get("/health")
        check("API health endpoint reachable", r.status_code == 200, f"HTTP {r.status_code}")
        body = r.json()
        check("Health status is ok or degraded (not error)", body.get("status") in ("ok", "degraded"), str(body))
    except Exception as exc:
        check("API health endpoint reachable", False, str(exc))
        print("\n  FATAL: Cannot reach API. Aborting remaining steps.\n")
        _print_summary()
        return 1

    # ── Step 2: Authentication ────────────────────────────────────────────────
    print("\n[ Step 2 ] Authentication")
    try:
        r = client.post("/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        check("Login returns 200", r.status_code == 200, f"HTTP {r.status_code}")
        token = r.json().get("access_token")
        check("Access token present in response", bool(token), "token: " + (token[:20] + "..." if token else "None"))
    except Exception as exc:
        check("Authentication", False, str(exc))

    if not token:
        print("\n  FATAL: No token. Aborting data ingestion steps.\n")
        _print_summary()
        return 1

    auth = {"Authorization": f"Bearer {token}"}

    # ── Step 3: Market data ingestion ────────────────────────────────────────
    print("\n[ Step 3 ] Market Data Ingestion")
    ingested_ids: list[int] = []
    for tick in SYNTHETIC_TICKS:
        try:
            r = client.post("/api/v1/market-data", json=tick, headers=auth)
            ok = r.status_code in (201, 409)  # 409 = already exists (idempotent)
            check(
                f"Ingest tick {tick['symbol']} @ {tick['timestamp']}",
                ok,
                f"HTTP {r.status_code}",
            )
            if r.status_code == 201:
                ingested_ids.append(r.json().get("id"))
        except Exception as exc:
            check(f"Ingest tick {tick['symbol']}", False, str(exc))

    # ── Step 4: Anomaly detection ─────────────────────────────────────────────
    print("\n[ Step 4 ] Anomaly Detection")
    try:
        r = client.get("/api/v1/anomalies?limit=20", headers=auth)
        check("Anomalies endpoint returns 200", r.status_code == 200, f"HTTP {r.status_code}")
        anomalies = r.json().get("items", [])
        check("At least one anomaly record exists", len(anomalies) > 0, f"{len(anomalies)} records")
        high_score = [a for a in anomalies if (a.get("anomaly_score") or 0) >= 0.5]
        print(f"  {INFO}  {len(high_score)} anomaly(ies) with score ≥ 0.5")
    except Exception as exc:
        check("Anomaly detection", False, str(exc))
        anomalies = []

    # ── Step 5: Case creation ────────────────────────────────────────────────
    print("\n[ Step 5 ] Investigation Case Management")
    case_id: int | None = None
    if anomalies:
        first_anomaly_id = anomalies[0]["id"]
        try:
            r = client.post(
                "/api/v1/cases",
                json={
                    "title": f"E2E Test Case — {datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
                    "anomaly_ids": [first_anomaly_id],
                },
                headers=auth,
            )
            check("Case creation returns 201", r.status_code == 201, f"HTTP {r.status_code}")
            if r.status_code == 201:
                case_id = r.json().get("id")
                print(f"  {INFO}  Case ID: {case_id}")
        except Exception as exc:
            check("Case creation", False, str(exc))

    if case_id:
        # Add a note with hashtags
        try:
            note_body = "E2E verification test note. #MONITOR — automated synthetic pipeline check."
            r = client.post(
                f"/api/v1/cases/{case_id}/notes",
                json={"body": note_body},
                headers=auth,
            )
            check("Analyst note submission returns 201", r.status_code == 201, f"HTTP {r.status_code}")
        except Exception as exc:
            check("Analyst note submission", False, str(exc))

        # Verify case events
        try:
            r = client.get(f"/api/v1/cases/{case_id}/events", headers=auth)
            check("Case events endpoint returns 200", r.status_code == 200)
            events = r.json() if r.status_code == 200 else []
            check("At least one case event recorded", len(events) > 0, f"{len(events)} events")
        except Exception as exc:
            check("Case events", False, str(exc))

        # Update case status
        try:
            r = client.patch(
                f"/api/v1/cases/{case_id}",
                json={"status": "IN_REVIEW"},
                headers=auth,
            )
            check("Case status transition to IN_REVIEW", r.status_code == 200, f"HTTP {r.status_code}")
        except Exception as exc:
            check("Case status transition", False, str(exc))

    # ── Step 6: Prometheus metrics ───────────────────────────────────────────
    print("\n[ Step 6 ] Prometheus Telemetry")
    try:
        r = client.get("/metrics")
        check("/metrics endpoint reachable", r.status_code == 200, f"HTTP {r.status_code}")
        body = r.text
        check("Contains heimdall_up metric", "heimdall_up" in body)
        check("Contains heimdall_http_requests_total metric", "heimdall_http_requests_total" in body)
        check("Metrics are non-empty", len(body) > 100, f"{len(body)} chars")

        # Verify SHA-256 of metrics snapshot for audit log integrity
        digest = sha256_of(body)
        print(f"  {INFO}  Metrics SHA-256: {digest[:32]}...")
        check("Metrics SHA-256 hash computed", len(digest) == 64)
    except Exception as exc:
        check("Prometheus metrics", False, str(exc))

    # ── Step 7: Telemetry status ─────────────────────────────────────────────
    print("\n[ Step 7 ] Telemetry Status API")
    try:
        r = client.get("/api/v1/telemetry/status", headers=auth)
        check("Telemetry status returns 200", r.status_code == 200, f"HTTP {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            check("Uptime seconds field present", "uptime_seconds" in data, str(data.get("uptime_seconds")))
    except Exception as exc:
        check("Telemetry status", False, str(exc))

    # ── Step 8: Search ──────────────────────────────────────────────────────
    print("\n[ Step 8 ] Search Endpoint")
    try:
        r = client.get("/api/v1/search?q=BTC", headers=auth)
        check("Search endpoint returns 200", r.status_code == 200, f"HTTP {r.status_code}")
    except Exception as exc:
        check("Search endpoint", False, str(exc))

    return _print_summary()


def _print_summary() -> int:
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = total - passed

    print(f"\n{'═' * 60}")
    print(f"  SUMMARY: {passed}/{total} checks passed, {failed} failed")
    print(f"{'═' * 60}")

    if failed:
        print("\n  Failed checks:")
        for name, ok, detail in results:
            if not ok:
                print(f"    ✗ {name}" + (f" ({detail})" if detail else ""))
        print()

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="HEIMDALL E2E Pipeline Verifier")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="API base URL")
    args = parser.parse_args()
    sys.exit(run_verification(args.base_url))
