import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Anomaly, Case, CaseNote, MarketData, User

def test_search_endpoint(client: TestClient, db_session: Session, registered_user: dict, auth_headers: dict):
    user_id = registered_user["id"]
    # Create market data
    md = MarketData(
        user_id=user_id,
        symbol="SEARCHBTC",
        timestamp="2026-08-01T10:00:00Z",
        open=100.0,
        high=105.0,
        low=95.0,
        close=102.0,
        volume=1000.0,
        market="CRYPTO",
    )
    db_session.add(md)
    db_session.commit()

    # Create anomaly
    anomaly = Anomaly(
        market_data_id=md.id,
        anomaly_score=0.95,
        is_anomaly=True,
        pattern_scores='{"pump_and_dump": 0.98, "wash_trading": 0.1}',
    )
    db_session.add(anomaly)
    
    # Create case
    case = Case(
        title="Suspicious SEARCHBTC behavior",
        status="OPEN",
        created_by_user_id=user_id,
    )
    db_session.add(case)
    db_session.flush()

    note = CaseNote(
        case_id=case.id,
        author_user_id=user_id,
        body="Found some unusual spoofing signals",
    )
    db_session.add(note)
    db_session.commit()

    # 1. Search by symbol
    response = client.get(
        "/api/v1/search?q=SEARCHBTC",
        headers=auth_headers
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) >= 2
    
    anomaly_result = next(r for r in results if r["type"] == "anomaly")
    assert anomaly_result["title"] == f"Anomaly #{anomaly.id} (SEARCHBTC)"
    assert "PUMP AND DUMP" in anomaly_result["subtitle"]
    assert anomaly_result["route"] == f"/anomalies?selected={anomaly.id}"
    
    case_result = next(r for r in results if r["type"] == "case")
    assert case_result["title"] == f"Case #{case.id}: Suspicious SEARCHBTC behavior"
    assert case_result["route"] == f"/investigations?selected={case.id}"

    # 2. Search by note body content
    note_resp = client.get(
        "/api/v1/search?q=spoofing",
        headers=auth_headers
    )
    assert note_resp.status_code == 200
    note_results = note_resp.json()["results"]
    assert any(r["id"] == f"case-{case.id}" for r in note_results)

    # 3. Search by exact numeric ID
    id_resp = client.get(
        f"/api/v1/search?q={case.id}",
        headers=auth_headers
    )
    assert id_resp.status_code == 200
    id_results = id_resp.json()["results"]
    assert any(r["id"] == f"case-{case.id}" for r in id_results)

def test_search_requires_auth(client: TestClient):
    response = client.get("/api/v1/search?q=BTC")
    assert response.status_code in (401, 403)
