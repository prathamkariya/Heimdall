"""
tests/test_anomaly.py — Anomaly detection endpoint tests.

Covers: score bounds, threshold logic, feature storage, auth guards.

PHASE 7 UPDATE: anomaly_service now scores with real trained
ml models instead of mock formulas (see
app/services/anomaly_service.py's module docstring). This changed two
things tests must account for, deliberately, not incidentally:

1. Real models need real rolling-window feature history (20+ trailing
   days) to produce a score at all -- sample_market_data (1 record) is
   no longer enough for tests that expect a real score.
   sample_market_data_with_history (conftest.py) provides 30 sequential
   days for exactly this reason. sample_market_data still exists and is
   used deliberately by test_insufficient_history_returns_400.

2. The feature set changed (mock's price_return/price_range/
   volume_zscore/price_volatility/body_ratio -> ml's
   return/volume_ratio_20d/volatility_20d), and xgboost_score was
   renamed to multi_pattern_max_score (see migration 004 and its
   docstring for why: the old name was never accurate even for the mock,
   and MultiPatternDetector's default estimator isn't XGBoost either --
   keeping a misleading name for convenience wasn't worth it).
"""
import json

import pytest


# ══════════════════════════════════════════════════════════════
# DETECT ANOMALY
# ══════════════════════════════════════════════════════════════
class TestDetectAnomaly:
    def test_detect_returns_201(self, client, auth_headers, sample_market_data_with_history):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        assert response.status_code == 201, response.text

    def test_response_has_all_required_fields(self, client, auth_headers, sample_market_data_with_history):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        body = response.json()
        for field in ("id", "market_data_id", "anomaly_score", "is_anomaly",
                      "isolation_forest_score", "multi_pattern_max_score",
                      "pattern_scores", "model_version", "features", "detected_at"):
            assert field in body, f"Missing field: {field}"

    def test_market_data_id_linked_correctly(self, client, auth_headers, sample_market_data_with_history):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        assert response.json()["market_data_id"] == sample_market_data_with_history["id"]

    # ── Score bounds ─────────────────────────────────────────
    def test_anomaly_score_bounded_0_to_1(self, client, auth_headers, sample_market_data_with_history):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        score = response.json()["anomaly_score"]
        assert 0.0 <= score <= 1.0, f"anomaly_score {score} out of [0,1]"

    def test_isolation_forest_score_bounded_0_to_1(self, client, auth_headers, sample_market_data_with_history):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        score = response.json()["isolation_forest_score"]
        assert score is not None
        assert 0.0 <= score <= 1.0, f"isolation_forest_score {score} out of [0,1]"

    def test_multi_pattern_max_score_bounded_0_to_1(self, client, auth_headers, sample_market_data_with_history):
        """Renamed from test_xgboost_score_bounded_0_to_1 -- see migration
        004's docstring for why the field itself was renamed, not just
        this test."""
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        score = response.json()["multi_pattern_max_score"]
        assert score is not None
        assert 0.0 <= score <= 1.0, f"multi_pattern_max_score {score} out of [0,1]"

    # ── Threshold logic ──────────────────────────────────────
    def test_threshold_1_means_not_anomaly(self, client, auth_headers, sample_market_data_with_history):
        """With threshold=1.0, is_anomaly is False unless the combined
        score hits EXACTLY 1.0. Both real scores are mathematically
        bounded in [0,1] (not mock-clamped), and reaching exactly 1.0
        would require both models to be maximally confident
        simultaneously -- practically not expected on realistic test
        data, though not a hard impossibility the way the old mock's
        clamped formula guaranteed. See anomaly_service._combine_scores'
        docstring."""
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
            "threshold": 1.0,
        }, headers=auth_headers)
        assert response.json()["is_anomaly"] is False

    def test_threshold_0_means_always_anomaly(self, client, auth_headers, sample_market_data_with_history):
        """With threshold=0.0, any score >= 0 triggers is_anomaly. Both
        real scores are non-negative by construction, so this holds
        genuinely, not just for the old mock."""
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
            "threshold": 0.0,
        }, headers=auth_headers)
        assert response.json()["is_anomaly"] is True

    def test_default_threshold_is_applied(self, client, auth_headers, sample_market_data_with_history):
        """Omitting threshold should still produce a valid boolean result."""
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        assert isinstance(response.json()["is_anomaly"], bool)

    # ── Features storage ─────────────────────────────────────
    def test_features_json_is_stored(self, client, auth_headers, sample_market_data_with_history):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        features_str = response.json().get("features")
        assert features_str is not None
        features = json.loads(features_str)
        assert isinstance(features, dict)

    def test_features_contains_expected_keys(self, client, auth_headers, sample_market_data_with_history):
        """Updated for the real feature set -- see this file's module
        docstring for why these are different from the old mock's keys."""
        from ml.config import BASE_FEATURE_COLUMNS
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        features = json.loads(response.json()["features"])
        expected_keys = set(BASE_FEATURE_COLUMNS)
        assert expected_keys == set(features.keys()), f"Expected exactly {expected_keys}, got {features.keys()}"

    # ── Per-pattern breakdown (new in Phase 7) ────────────────
    def test_pattern_scores_contains_all_four_patterns(self, client, auth_headers, sample_market_data_with_history):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        pattern_scores = json.loads(response.json()["pattern_scores"])
        assert set(pattern_scores.keys()) == {"pump_and_dump", "wash_trading", "spoofing", "layering"}

    def test_pattern_scores_are_bounded_0_to_1(self, client, auth_headers, sample_market_data_with_history):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        pattern_scores = json.loads(response.json()["pattern_scores"])
        for pattern, score in pattern_scores.items():
            assert 0.0 <= score <= 1.0, f"{pattern} score {score} out of [0,1]"

    def test_multi_pattern_max_score_equals_max_of_pattern_scores(self, client, auth_headers, sample_market_data_with_history):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        body = response.json()
        pattern_scores = json.loads(body["pattern_scores"])
        assert body["multi_pattern_max_score"] == pytest.approx(max(pattern_scores.values()))

    def test_model_version_is_populated(self, client, auth_headers, sample_market_data_with_history):
        """Provenance: which trained model(s) actually produced this
        score. Should mention both model types when both are loaded."""
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        model_version = response.json()["model_version"]
        assert model_version
        assert "isolation_forest=" in model_version
        assert "multi_pattern=" in model_version

    # ── Error cases ──────────────────────────────────────────
    def test_nonexistent_market_data_returns_404(self, client, auth_headers):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": 999999,
        }, headers=auth_headers)
        assert response.status_code == 404

    def test_insufficient_history_returns_400(self, client, auth_headers, sample_market_data):
        """New in Phase 7: real models need 20+ trailing days of history
        to compute rolling-window features. sample_market_data creates
        exactly ONE record -- deliberately not enough -- so this should
        fail clearly with 400, not silently score against a garbage or
        default-filled feature vector. See
        anomaly_service._market_data_to_feature_row's docstring."""
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data["id"],
        }, headers=auth_headers)
        assert response.status_code == 400
        assert "Not enough historical data" in response.json()["detail"]

    def test_threshold_above_1_returns_422(self, client, auth_headers, sample_market_data):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data["id"],
            "threshold": 1.5,               # max is 1.0
        }, headers=auth_headers)
        assert response.status_code == 422

    def test_threshold_below_0_returns_422(self, client, auth_headers, sample_market_data):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data["id"],
            "threshold": -0.1,              # min is 0.0
        }, headers=auth_headers)
        assert response.status_code == 422

    def test_missing_market_data_id_returns_422(self, client, auth_headers):
        response = client.post("/api/v1/anomalies", json={}, headers=auth_headers)
        assert response.status_code == 422

    def test_zero_market_data_id_returns_422(self, client, auth_headers):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": 0,            # must be > 0 per schema
        }, headers=auth_headers)
        assert response.status_code == 422

    def test_requires_auth(self, client, sample_market_data):
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data["id"],
        })
        assert response.status_code in (401, 403)

    # ── Weighted combination ─────────────────────────────────
    def test_composite_score_is_weighted_average(self, client, auth_headers, sample_market_data_with_history):
        """anomaly_score should equal 0.6*IF + 0.4*multi_pattern_max
        (within float tolerance) when both models are loaded."""
        response = client.post("/api/v1/anomalies", json={
            "market_data_id": sample_market_data_with_history["id"],
        }, headers=auth_headers)
        body = response.json()
        if_score = body["isolation_forest_score"]
        mp_score = body["multi_pattern_max_score"]
        expected = round(0.6 * if_score + 0.4 * mp_score, 4)
        assert abs(body["anomaly_score"] - expected) < 1e-4, (
            f"Expected weighted score {expected}, got {body['anomaly_score']}"
        )

    def test_detect_anomaly_routes_to_correct_market(self, client, auth_headers, sample_market_data_with_history):
        # sample_market_data_with_history created 30 records with market='US_EQUITY'.
        record_id = sample_market_data_with_history["id"]
        
        # This will trigger the anomaly check, and it succeeds with 201.
        resp2 = client.post(
            "/api/v1/anomalies",
            json={"market_data_id": record_id},
            headers=auth_headers
        )
        assert resp2.status_code == 201
        assert "anomaly_score" in resp2.json()

    def test_detect_anomaly_null_market_returns_400(self, client, auth_headers, db_session, sample_market_data_with_history):
        # We simulate legacy data without a market by dropping it down to the DB directly.
        from app.models import MarketData
        
        db = db_session
        
        # Take the last record (which has enough history preceding it) and set market=None
        legacy_id = sample_market_data_with_history["id"]
        legacy_md = db.query(MarketData).filter(MarketData.id == legacy_id).first()
        legacy_md.market = None
        db.commit()
        
        # Trigger anomaly endpoint on legacy record -> should return 400
        resp = client.post(
            "/api/v1/anomalies",
            json={"market_data_id": legacy_id},
            headers=auth_headers
        )
        assert resp.status_code == 400
        assert "Market classification missing" in resp.json()["detail"]

    def test_health_models_endpoint(self, client):
        resp = client.get("/health/models")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "markets" in data
        assert "CRYPTO" in data["markets"]
        assert "US_EQUITY" in data["markets"]

    def test_anomalies_models_status_endpoint(self, client, auth_headers):
        resp = client.get("/api/v1/anomalies/models/status", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "markets" in data


# ══════════════════════════════════════════════════════════════
# FIX-G01 REGRESSION: z_score reaches the UI for historical anomalies
# ══════════════════════════════════════════════════════════════
class TestHistoricalZScoreEvidence:
    """FIX-G01: list_anomalies must pass zscored_features into
    generate_evidence_signals so that historical anomaly reviews show
    real z_score values rather than 'Not available' on every signal.

    Before the fix, generate_evidence_signals was called with only 3 args,
    defaulting zscored_features to None, meaning every analyst who opened
    an anomaly detail after the fact saw null z-scores — negating the value
    of FIX-F02's z_score infrastructure.
    """

    def test_list_anomalies_evidence_signal_structure(
        self, client, auth_headers, sample_market_data_with_history
    ):
        """After scoring, list_anomalies must return evidence signals with
        the expected keys present (value, threshold, triggered).
        z_score may be null if the symbol has no baseline, but the field
        must exist in each signal dict rather than being absent entirely.
        """
        # First, score the record so an Anomaly row exists
        score_resp = client.post(
            "/api/v1/anomalies",
            json={"market_data_id": sample_market_data_with_history["id"]},
            headers=auth_headers,
        )
        assert score_resp.status_code == 201

        # Fetch via list endpoint (the historical path that was broken)
        list_resp = client.get("/api/v1/anomalies", headers=auth_headers)
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        assert len(items) > 0, "Expected at least one anomaly in list response"

        scored = items[0]
        # evidence is populated when features are stored
        if scored.get("evidence"):
            for sig in scored["evidence"]:
                assert "name" in sig, f"Signal missing 'name': {sig}"
                assert "value" in sig, f"Signal missing 'value': {sig}"
                assert "threshold" in sig, f"Signal missing 'threshold': {sig}"
                assert "triggered" in sig, f"Signal missing 'triggered': {sig}"
                # z_score key must be present (may be null for symbols without
                # baseline — that's the correct 'Not available' state, not an error)
                assert "z_score" in sig, (
                    f"Signal missing 'z_score' key entirely (FIX-G01 regression): {sig}\n"
                    "This means zscored_features is not being passed to "
                    "generate_evidence_signals() in list_anomalies."
                )


# ══════════════════════════════════════════════════════════════
# FIX-G02 REGRESSION: detector_agreement no longer bleeds into attribution confidence
# ══════════════════════════════════════════════════════════════
class TestWeakLabelConfidence:
    """FIX-G02 (Option B): compute_weak_label_confidence must NOT multiply
    by detector_agreement. The two values are independently interpretable
    signals — collapsing them into one number was causing strong single-detector
    detections (e.g. IF=0.846, 95% pump_and_dump) to display as low-confidence.

    The concrete bug: a BTCUSDT anomaly with IF=0.846 showed
    Attribution Confidence 26.0% because multi_pattern_max_score landed
    under 0.6, producing detector_agreement=0.5, which was then multiplied
    into an already-reasonable wlc. The fix: stop that multiplication.
    """

    def test_strong_single_detector_not_collapsed_to_same_as_weak_pair(self):
        """A strong signal (high IF, pump_and_dump dominant) must produce
        higher weak_label_confidence than a genuinely weak pair where two
        patterns are nearly tied. Before the fix both cases were penalized
        identically when detector_agreement=0.5 was used as a multiplier.
        """
        from app.models import compute_weak_label_confidence

        # Strong case: one pattern clearly dominates
        strong_pattern_scores = {"pump_and_dump": 0.95, "wash_trading": 0.03, "spoofing": 0.01, "layering": 0.01}
        wlc_strong = compute_weak_label_confidence(strong_pattern_scores)

        # Weak case: two patterns nearly tied (genuinely uncertain attribution)
        weak_pattern_scores = {"pump_and_dump": 0.51, "wash_trading": 0.49, "spoofing": 0.0, "layering": 0.0}
        wlc_weak = compute_weak_label_confidence(weak_pattern_scores)

        assert wlc_strong is not None
        assert wlc_weak is not None
        assert wlc_strong > wlc_weak, (
            f"FIX-G02 regression: strong detection (wlc={wlc_strong}) should be "
            f"more confident than a tied pair (wlc={wlc_weak}). "
            "If they're equal, detector_agreement is still being multiplied in."
        )

    def test_wlc_single_pattern_returns_raw_probability(self):
        """When only one pattern is present, wlc equals that pattern's probability."""
        from app.models import compute_weak_label_confidence

        result = compute_weak_label_confidence({"pump_and_dump": 0.87})
        assert result == pytest.approx(0.87, abs=1e-4)

    def test_wlc_none_when_no_pattern_scores(self):
        """Returns None gracefully for empty or None input."""
        from app.models import compute_weak_label_confidence

        assert compute_weak_label_confidence(None) is None
        assert compute_weak_label_confidence({}) is None

    def test_check_detector_agreement_still_independent(self):
        """check_detector_agreement still returns 0.5 for partial agreement —
        it's used as a UI badge, not a multiplier, so the value itself is fine.
        What's changed is that it's no longer multiplied into wlc.
        """
        from app.models import check_detector_agreement

        # High IF, lower pattern score (below 0.6 cutoff) → PARTIAL
        da_partial = check_detector_agreement(0.846, 0.55)
        assert da_partial == 0.5, f"Expected 0.5 (PARTIAL), got {da_partial}"

        # Both above threshold → BOTH AGREE
        da_both = check_detector_agreement(0.75, 0.80)
        assert da_both == 1.0, f"Expected 1.0 (BOTH AGREE), got {da_both}"
