from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Anomaly, Case, CaseNote, MarketData, User
from app.services.auth_service import create_access_token, hash_password


def test_search_endpoint(client: TestClient, db_session: Session, registered_user: dict, auth_headers: dict):
    user_id = registered_user["id"]
    # Create market data
    md = MarketData(
        user_id=user_id,
        symbol="SEARCHBTC",
        timestamp=datetime(2026, 8, 1, 10, 0, 0, tzinfo=timezone.utc),
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


def test_search_does_not_leak_other_users_data(client: TestClient, db_session: Session, registered_user: dict, auth_headers: dict):
    """A regular user's search must not surface another user's anomalies or cases."""
    user1_id = registered_user["id"]

    # Second, unrelated user
    user2 = User(email="searchuser2@marketsurveillance.local", username="searchuser2", hashed_password=hash_password("pass"))
    db_session.add(user2)
    db_session.commit()
    db_session.refresh(user2)
    user2_token = create_access_token(user_id=user2.id, email=user2.email)
    user2_headers = {"Authorization": f"Bearer {user2_token}"}
    client2 = TestClient(client.app)

    # Market data + anomaly owned by user 2
    md2 = MarketData(
        user_id=user2.id,
        symbol="PRIVATEETH",
        timestamp=datetime(2026, 8, 1, 10, 0, 0, tzinfo=timezone.utc),
        open=1.0, high=2.0, low=1.0, close=1.5, volume=100.0,
        market="CRYPTO",
    )
    db_session.add(md2)
    db_session.commit()
    db_session.refresh(md2)

    anomaly2 = Anomaly(market_data_id=md2.id, anomaly_score=0.9, is_anomaly=True, pattern_scores="{}")
    db_session.add(anomaly2)

    # Case owned by user 2, with a note only user 2 should be able to find
    case2 = Case(title="User2 private investigation PRIVATEETH", status="OPEN", created_by_user_id=user2.id)
    db_session.add(case2)
    db_session.flush()
    note2 = CaseNote(case_id=case2.id, author_user_id=user2.id, body="secret layering evidence")
    db_session.add(note2)
    db_session.commit()

    # User 1 searches for user 2's symbol/case/note content -> must see nothing
    resp = client.get("/api/v1/search?q=PRIVATEETH", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["results"] == []

    resp = client.get("/api/v1/search?q=layering", headers=auth_headers)
    assert resp.status_code == 200
    assert not any(r["id"] == f"case-{case2.id}" for r in resp.json()["results"])

    resp = client.get(f"/api/v1/search?q={case2.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert not any(r["id"] == f"case-{case2.id}" for r in resp.json()["results"])

    # Sanity check: user 2 CAN find their own data
    resp2 = client2.get("/api/v1/search?q=PRIVATEETH", headers=user2_headers)
    assert resp2.status_code == 200
    assert any(r["id"] == f"anomaly-{anomaly2.id}" for r in resp2.json()["results"])
