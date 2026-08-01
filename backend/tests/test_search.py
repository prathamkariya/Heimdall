import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Anomaly, Case, MarketData, User

def test_search_endpoint(client: TestClient, db_session: Session, test_user: User):
    # Create market data
    md = MarketData(
        user_id=test_user.id,
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
        description="Found some pump and dump",
        status="OPEN",
        created_by_user_id=test_user.id,
    )
    db_session.add(case)
    db_session.commit()

    # Search by symbol
    response = client.get(
        "/api/v1/search?q=SEARCHBTC",
        headers={"Authorization": f"Bearer token_{test_user.id}"}
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) >= 2
    
    anomaly_result = next(r for r in results if r["type"] == "anomaly")
    assert anomaly_result["title"] == f"Anomaly #{anomaly.id} (SEARCHBTC)"
    assert "PUMP AND DUMP" in anomaly_result["subtitle"]
    
    case_result = next(r for r in results if r["type"] == "case")
    assert case_result["title"] == f"Case #{case.id}: Suspicious SEARCHBTC behavior"
