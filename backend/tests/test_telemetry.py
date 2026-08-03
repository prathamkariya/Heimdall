"""tests/test_telemetry.py — Tests for Prometheus metrics and system telemetry router."""
import pytest
from datetime import datetime, timezone, timedelta
from app.models import Anomaly, MarketData
from app.routers.telemetry import (
    record_request,
    record_anomaly,
    record_ingestion,
    set_active_subscribers,
)


def test_prometheus_metrics_endpoint_unauthenticated(client):
    """GET /metrics should be accessible without auth and return Prometheus text format."""
    # Seed metrics
    record_request("/api/v1/test", "GET", 200, 0.045)
    record_anomaly("CRYPTO", "pump_and_dump", "CRITICAL")
    record_ingestion("CRYPTO", 5)
    set_active_subscribers(3)

    response = client.get("/metrics")
    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    body = response.text
    assert "heimdall_up" in body
    assert "heimdall_http_requests_total" in body
    assert "heimdall_anomalies_detected_total" in body
    assert "heimdall_ingestion_processed_total" in body
    assert "heimdall_active_stream_subscribers 3" in body


def test_telemetry_status_requires_auth(client):
    """GET /api/v1/telemetry/status should return 401 or 403 without authentication."""
    response = client.get("/api/v1/telemetry/status")
    assert response.status_code in (401, 403)


def test_telemetry_status_accurate_anomaly_and_market_counts(client, registered_user, auth_headers, db_session):
    """GET /api/v1/telemetry/status accurately reports anomaly counts and market data counts (not just 0 or 1)."""
    now = datetime.now(timezone.utc)
    user_id = registered_user["id"]

    # 1. Initially empty
    response = client.get("/api/v1/telemetry/status", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["anomalies_last_24h"] == 0
    assert data["market_data_last_24h"] == {}

    # 2. Insert 3 Crypto MarketData ticks and 3 Crypto Anomalies
    crypto_md_ids = []
    for i in range(3):
        md = MarketData(
            user_id=user_id,
            symbol=f"BTCUSDT_{i}",
            market="CRYPTO",
            timestamp=now - timedelta(minutes=10 * i),
            open=50000.0,
            high=51000.0,
            low=49000.0,
            close=50500.0,
            volume=100.0,
        )
        db_session.add(md)
        db_session.flush()
        crypto_md_ids.append(md.id)

        anom = Anomaly(
            market_data_id=md.id,
            anomaly_score=0.85 + (i * 0.02),
            is_anomaly=True,
            detected_at=now - timedelta(minutes=5 * i),
        )
        db_session.add(anom)

    # 3. Insert 2 US_EQUITY MarketData ticks and 2 US_EQUITY Anomalies
    for i in range(2):
        md = MarketData(
            user_id=user_id,
            symbol=f"AAPL_{i}",
            market="US_EQUITY",
            timestamp=now - timedelta(minutes=15 * i),
            open=180.0,
            high=185.0,
            low=179.0,
            close=184.0,
            volume=5000.0,
        )
        db_session.add(md)
        db_session.flush()

        anom = Anomaly(
            market_data_id=md.id,
            anomaly_score=0.90,
            is_anomaly=True,
            detected_at=now - timedelta(minutes=8 * i),
        )
        db_session.add(anom)

    db_session.flush()

    # Query telemetry status again — should report exactly 5 total anomalies (3 crypto + 2 us_equity)
    response = client.get("/api/v1/telemetry/status", headers=auth_headers)
    assert response.status_code == 200
    status_data = response.json()

    assert status_data["anomalies_last_24h"] == 5
    assert status_data["anomalies_by_market_last_24h"]["CRYPTO"] == 3
    assert status_data["anomalies_by_market_last_24h"]["US_EQUITY"] == 2
    assert status_data["market_data_last_24h"]["CRYPTO"] == 3
    assert status_data["market_data_last_24h"]["US_EQUITY"] == 2
    assert "uptime_seconds" in status_data
    assert "active_subscribers" in status_data


def test_market_data_correlation_requires_auth(client):
    """GET /api/v1/market-data/correlation should return 401 or 403 without authentication."""
    response = client.get("/api/v1/market-data/correlation")
    assert response.status_code in (401, 403)


def test_market_data_correlation_insufficient_data(client, auth_headers):
    """GET /api/v1/market-data/correlation should return 422 if data is sparse."""
    response = client.get("/api/v1/market-data/correlation?symbols=BTCUSDT,ETHUSDT", headers=auth_headers)
    assert response.status_code == 422
    assert "Insufficient market data" in response.json()["detail"]


def test_market_data_correlation_success(client, registered_user, auth_headers, db_session):
    """GET /api/v1/market-data/correlation computes symmetric Pearson matrix."""
    now = datetime.now(timezone.utc)
    user_id = registered_user["id"]

    # Insert 5 sequential price points for BTCUSDT and ETHUSDT
    for i in range(5):
        db_session.add(MarketData(
            user_id=user_id,
            symbol="BTCUSDT",
            market="CRYPTO",
            timestamp=now - timedelta(minutes=5 - i),
            open=50000.0,
            high=50100.0,
            low=49900.0,
            close=50000.0 + (i * 100),
            volume=10.0,
        ))
        db_session.add(MarketData(
            user_id=user_id,
            symbol="ETHUSDT",
            market="CRYPTO",
            timestamp=now - timedelta(minutes=5 - i),
            open=3000.0,
            high=3050.0,
            low=2950.0,
            close=3000.0 + (i * 10),
            volume=50.0,
        ))
    db_session.flush()

    response = client.get("/api/v1/market-data/correlation?symbols=BTCUSDT,ETHUSDT", headers=auth_headers)
    assert response.status_code == 200
    res_data = response.json()
    assert "symbols" in res_data
    assert "matrix" in res_data
    assert len(res_data["symbols"]) == 2
    # Diagonal correlation is always 1.0
    assert res_data["matrix"][0][0] == 1.0
    assert res_data["matrix"][1][1] == 1.0
    # Perfect co-movement -> r ≈ 1.0
    assert res_data["matrix"][0][1] > 0.95
