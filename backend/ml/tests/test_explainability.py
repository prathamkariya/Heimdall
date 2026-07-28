from ml.explainability import generate_evidence_signals


def test_explainability_returns():
    # 1-day return 3% > 2% threshold -> triggered
    raw_features = {"return": 0.03}
    signals = generate_evidence_signals(raw_features)
    assert len(signals) == 1
    assert signals[0]["name"] == "high_return"
    
    # 5-day return 3% < 5% threshold -> not triggered
    raw_features = {"rolling_return_5d": 0.03}
    signals = generate_evidence_signals(raw_features)
    assert len(signals) == 0

    # 5-day return 6% > 5% threshold -> triggered
    raw_features = {"rolling_return_5d": 0.06}
    signals = generate_evidence_signals(raw_features)
    assert len(signals) == 1
    assert signals[0]["name"] == "high_rolling_return_5d"

def test_explainability_momentum():
    raw_features = {"price_momentum": 0.06}
    signals = generate_evidence_signals(raw_features)
    assert len(signals) == 1
    assert signals[0]["name"] == "high_price_momentum"

def test_explainability_absolute_features_are_ignored():
    # These absolute scale indicators shouldn't generate signals just based on static thresholds
    raw_features = {
        "rolling_volume_mean": 1000000,
        "true_range": 5.5,
        "obv": 50000,
        "macd": 1.2
    }
    signals = generate_evidence_signals(raw_features)
    assert len(signals) == 0

def test_explainability_model_scores():
    raw_features = {"return": 0.01}  # No signal from features
    
    # Isolation forest > 0.65 -> triggered
    signals = generate_evidence_signals(raw_features, isolation_forest_score=0.70)
    assert len(signals) == 1
    assert signals[0]["name"] == "isolation_forest_outlier"
    
    # Both models > 0.65 -> triggered
    signals = generate_evidence_signals(
        raw_features, 
        isolation_forest_score=0.70,
        multi_pattern_max_score=0.80
    )
    assert len(signals) == 2
    assert signals[0]["name"] == "isolation_forest_outlier"
    assert signals[1]["name"] == "multi_pattern_classifier"
