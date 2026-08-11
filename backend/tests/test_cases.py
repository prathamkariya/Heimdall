from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Anomaly, CaseStatus, MarketData, User
from app.services.auth_service import create_access_token, hash_password


def test_case_creation_and_visibility(client: TestClient, db_session: Session, auth_headers: dict, registered_user: dict):
    test_user = db_session.query(User).filter(User.id == registered_user["id"]).first()
    
    # 1. Create a second user via DB
    user2 = User(email="user2@marketsurveillance.local", username="user2", hashed_password=hash_password("pass"))
    db_session.add(user2)
    db_session.commit()
    db_session.refresh(user2)
    
    user2_token = create_access_token(user_id=user2.id, email=user2.email)
    user2_headers = {"Authorization": f"Bearer {user2_token}"}
    client2 = TestClient(client.app)

    # 2. Seed an anomaly for user 1
    md1 = MarketData(user_id=test_user.id, symbol="BTC", open=1, high=2, low=1, close=1.5, volume=100, timestamp=datetime(2023, 1, 1, 0, 0, tzinfo=timezone.utc), market="CRYPTO")
    db_session.add(md1)
    db_session.commit()
    db_session.refresh(md1)
    
    an1 = Anomaly(market_data_id=md1.id, anomaly_score=0.9, is_anomaly=True, features="{}", pattern_scores="{}")
    db_session.add(an1)
    db_session.commit()
    db_session.refresh(an1)

    # 3. User 2 tries to create a case with user 1's anomaly -> 403 Forbidden
    resp = client2.post("/api/v1/cases", headers=user2_headers, json={
        "title": "Cross user case",
        "anomaly_ids": [an1.id]
    })
    assert resp.status_code == 403

    # 4. User 1 creates a case with their own anomaly -> 201 Created
    resp = client.post("/api/v1/cases", headers=auth_headers, json={
        "title": "My legitimate case",
        "anomaly_ids": [an1.id]
    })
    assert resp.status_code == 201
    case_id = resp.json()["id"]

    # 5. User 2 tries to view User 1's case -> 403 Forbidden (visibility filter)
    resp = client2.get(f"/api/v1/cases/{case_id}", headers=user2_headers)
    assert resp.status_code == 403

    # 6. User 2 tries to add a note to User 1's case -> 403 Forbidden
    resp = client2.post(f"/api/v1/cases/{case_id}/notes", headers=user2_headers, json={"body": "Sneaky note"})
    assert resp.status_code == 403


def test_analyst_assignment_and_notes(client: TestClient, db_session: Session, auth_headers: dict, registered_user: dict):
    test_user = db_session.query(User).filter(User.id == registered_user["id"]).first()
    
    # Set up an analyst user via DB
    analyst_user = User(email="analyst@marketsurveillance.local", username="analyst1", hashed_password=hash_password("pass"), role="analyst")
    db_session.add(analyst_user)
    db_session.commit()
    db_session.refresh(analyst_user)
    
    analyst_token = create_access_token(user_id=analyst_user.id, email=analyst_user.email)
    analyst_headers = {"Authorization": f"Bearer {analyst_token}"}
    client_analyst = TestClient(client.app)

    # User 1 creates a case (needs an anomaly)
    md = MarketData(user_id=test_user.id, symbol="ETH", open=1, high=2, low=1, close=1.5, volume=100, timestamp=datetime(2023, 1, 1, 0, 0, tzinfo=timezone.utc), market="CRYPTO")
    db_session.add(md)
    db_session.commit()
    db_session.refresh(md)
    an = Anomaly(market_data_id=md.id, anomaly_score=0.9, is_anomaly=True, features="{}", pattern_scores="{}")
    db_session.add(an)
    db_session.commit()
    db_session.refresh(an)

    resp = client.post("/api/v1/cases", headers=auth_headers, json={
        "title": "Please investigate ETH",
        "anomaly_ids": [an.id]
    })
    case_id = resp.json()["id"]

    # Analyst can see the case even though they are not the creator
    resp = client_analyst.get(f"/api/v1/cases/{case_id}", headers=analyst_headers)
    assert resp.status_code == 200

    # User 1 assigns case to Analyst
    resp = client.post(f"/api/v1/cases/{case_id}/assign", headers=auth_headers, json={
        "assignee_user_id": analyst_user.id
    })
    assert resp.status_code == 200
    assert resp.json()["assigned_to_user_id"] == analyst_user.id

    # Non-analyst tries to assign case to themselves -> 400 or 403 depending on implementation, 
    # but target is not analyst so 400
    resp = client.post(f"/api/v1/cases/{case_id}/assign", headers=auth_headers, json={
        "assignee_user_id": test_user.id
    })
    assert resp.status_code == 400

    # Analyst adds a note
    resp = client_analyst.post(f"/api/v1/cases/{case_id}/notes", headers=analyst_headers, json={
        "body": "Looking into it"
    })
    assert resp.status_code == 200


def test_case_audit_trail_timeline(client: TestClient, db_session: Session, auth_headers: dict, registered_user: dict):
    test_user = db_session.query(User).filter(User.id == registered_user["id"]).first()
    """
    B5: Write one integration test that does all four kinds of mutation to one case 
    and asserts the event count and order match.
    """
    # 1. Promote test_user to analyst so they can assign to themselves for simplicity
    test_user.role = "analyst"
    db_session.commit()

    md = MarketData(user_id=test_user.id, symbol="SOL", open=1, high=2, low=1, close=1.5, volume=100, timestamp=datetime(2023, 1, 1, 0, 0, tzinfo=timezone.utc), market="CRYPTO")
    db_session.add(md)
    db_session.commit()
    db_session.refresh(md)
    an = Anomaly(market_data_id=md.id, anomaly_score=0.9, is_anomaly=True, features="{}", pattern_scores="{}")
    db_session.add(an)
    db_session.commit()
    db_session.refresh(an)

    # Mutation 1: Create Case
    resp = client.post("/api/v1/cases", headers=auth_headers, json={
        "title": "Timeline Test Case",
        "anomaly_ids": [an.id]
    })
    case_id = resp.json()["id"]

    # Mutation 2: Status Change
    resp = client.patch(f"/api/v1/cases/{case_id}", headers=auth_headers, json={
        "status": CaseStatus.IN_REVIEW
    })
    assert resp.status_code == 200

    # Mutation 3: Assign
    resp = client.post(f"/api/v1/cases/{case_id}/assign", headers=auth_headers, json={
        "assignee_user_id": test_user.id
    })
    assert resp.status_code == 200

    # Mutation 4: Add Note
    resp = client.post(f"/api/v1/cases/{case_id}/notes", headers=auth_headers, json={
        "body": "This is a note"
    })
    assert resp.status_code == 200

    # Verify Timeline Events
    resp = client.get(f"/api/v1/cases/{case_id}/events", headers=auth_headers)
    assert resp.status_code == 200
    events = resp.json()

    assert len(events) == 4
    
    # Event types should be in chronological order
    event_types = [e["event_type"] for e in events]
    assert event_types == ["CREATED", "STATUS_CHANGE", "ASSIGNED", "NOTE_ADDED"]


def test_link_anomalies(client: TestClient, db_session: Session, auth_headers: dict, registered_user: dict):
    test_user = db_session.query(User).filter(User.id == registered_user["id"]).first()

    md = MarketData(user_id=test_user.id, symbol="LINK", open=1, high=2, low=1, close=1.5, volume=100, timestamp=datetime(2023, 1, 1, 0, 0, tzinfo=timezone.utc), market="CRYPTO")
    db_session.add(md)
    db_session.commit()
    db_session.refresh(md)

    an1 = Anomaly(market_data_id=md.id, anomaly_score=0.9, is_anomaly=True, features="{}", pattern_scores="{}")
    an2 = Anomaly(market_data_id=md.id, anomaly_score=0.95, is_anomaly=True, features="{}", pattern_scores="{}")
    db_session.add_all([an1, an2])
    db_session.commit()
    db_session.refresh(an1)
    db_session.refresh(an2)

    # 1. Create Case with anomaly 1
    resp = client.post("/api/v1/cases", headers=auth_headers, json={
        "title": "Link Anomalies Test",
        "anomaly_ids": [an1.id]
    })
    assert resp.status_code == 201
    case_id = resp.json()["id"]

    # 2. Link anomaly 2 to case
    resp = client.post(f"/api/v1/cases/{case_id}/anomalies", headers=auth_headers, json={
        "anomaly_ids": [an2.id]
    })
    assert resp.status_code == 200
    assert an2.id in resp.json()["anomaly_ids"]

    # 3. Check case events for UPDATED event
    resp = client.get(f"/api/v1/cases/{case_id}/events", headers=auth_headers)
    assert resp.status_code == 200
    events = resp.json()
    assert any(e["event_type"] == "ANOMALY_LINKED" and "Linked anomaly" in e["detail"] for e in events)


def test_list_analysts(client: TestClient, db_session: Session, auth_headers: dict):
    # Seed an analyst user
    analyst = User(
        email="specific_analyst@marketsurveillance.local",
        username="spec_analyst",
        hashed_password=hash_password("pass"),
        role="analyst"
    )
    db_session.add(analyst)
    db_session.commit()
    db_session.refresh(analyst)

    resp = client.get("/api/v1/cases/analysts", headers=auth_headers)
    assert resp.status_code == 200
    analysts = resp.json()
    assert any(a["id"] == analyst.id for a in analysts)
