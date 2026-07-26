"""tests/test_reports.py — Tests for the MAR report generator endpoints."""
import pytest
from unittest.mock import patch, MagicMock

# ══════════════════════════════════════════════════════════════
# MAR REPORT GENERATION (Phase 9 - Tests for IDOR & Edge cases)
# ══════════════════════════════════════════════════════════════
class TestMarReports:
    @patch("app.services.mar_generator.genai.Client")
    def test_mar_report_missing_case_returns_404(self, mock_client, client, auth_headers, db_session):
        response = client.get("/api/v1/reports/mar/case/9999", headers=auth_headers)
        assert response.status_code == 404
        assert "case not found" in response.json()["detail"].lower()

    @patch("app.services.mar_generator.genai.Client")
    def test_mar_report_idor_blocked(self, mock_client, client, auth_headers, db_session):
        from app.models import Case, User
        db = db_session
        user_a = db.query(User).filter(User.email == "test@example.com").first()
        
        # Create user B to test IDOR
        import uuid
        hacker_id = uuid.uuid4().hex[:6]
        hacker_email = f"hacker_{hacker_id}@example.com"
        hacker_username = f"hacker_{hacker_id}"
        client.post("/api/v1/auth/register", json={"email": hacker_email, "username": hacker_username, "password": "SecurePass1"})
        resp = client.post("/api/v1/auth/login", json={"email": hacker_email, "password": "SecurePass1"})
        other_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        
        # Create a Case owned by user_a
        case = Case(created_by_user_id=user_a.id, title="Test Case")
        db.add(case)
        db.commit()
        db.refresh(case)
        
        # Hacker tries to access User A's case report
        response = client.get(f"/api/v1/reports/mar/case/{case.id}", headers=other_headers)
        assert response.status_code == 403
        assert "permission to access this report" in response.json()["detail"].lower()

    @patch("app.services.mar_generator.genai.Client")
    def test_mar_report_creator_is_allowed(self, mock_client, client, auth_headers, db_session):
        from app.models import Case, User
        
        mock_instance = MagicMock()
        mock_instance.models.generate_content.return_value = MagicMock(text="# Mock MAR Report")
        mock_client.return_value = mock_instance

        db = db_session
        user_a = db.query(User).filter(User.email == "test@example.com").first()

        # Create a Case owned by user_a
        case = Case(created_by_user_id=user_a.id, title="Test Case")
        db.add(case)
        db.commit()
        db.refresh(case)
        
        response = client.get(f"/api/v1/reports/mar/case/{case.id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"


