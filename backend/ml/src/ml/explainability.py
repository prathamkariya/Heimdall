"""backend/ml/src/ml/explainability.py - Evidence generation logic."""
import logging
from typing import Any

from ml.config import BASE_FEATURE_COLUMNS

logger = logging.getLogger(__name__)

def generate_evidence_signals(
    raw_features: dict[str, Any],
    isolation_forest_score: float | None = None,
    multi_pattern_max_score: float | None = None,
    zscored_features: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Dynamically generates explainability evidence from raw feature values and model scores.
    Iterates over BASE_FEATURE_COLUMNS so it stays in sync as the feature set expands.
    Returns a list of dictionaries that match EvidenceSignalSchema.
    """
    signals = []

    for feature_name in BASE_FEATURE_COLUMNS:
        val = raw_features.get(feature_name)
        if val is None:
            continue
            
        try:
            val = float(val)
        except (ValueError, TypeError):
            continue

        # Dynamic thresholds based on feature semantics
        if feature_name in ("return", "log_return"):
            if abs(val) > 0.02:
                signals.append({"name": f"high_{feature_name}", "value": val, "threshold": 0.02, "triggered": True})
        elif feature_name == "rolling_return_5d":
            if abs(val) > 0.05:
                signals.append({"name": f"high_{feature_name}", "value": val, "threshold": 0.05, "triggered": True})
        elif feature_name == "rolling_return_10d":
            if abs(val) > 0.10:
                signals.append({"name": f"high_{feature_name}", "value": val, "threshold": 0.10, "triggered": True})
        elif feature_name == "price_momentum":
            if abs(val) > 0.05:
                signals.append({"name": f"high_{feature_name}", "value": val, "threshold": 0.05, "triggered": True})
        elif "volume_ratio" in feature_name:
            if val > 1.5:
                signals.append({"name": f"{feature_name}_spike", "value": val, "threshold": 1.5, "triggered": True})
        elif "volatility" in feature_name:
            if val > 0.05:
                signals.append({"name": f"high_{feature_name}", "value": val, "threshold": 0.05, "triggered": True})
        elif "rsi" in feature_name:
            if val > 70.0:
                signals.append({"name": f"{feature_name}_overbought", "value": val, "threshold": 70.0, "triggered": True})
            elif val < 30.0:
                signals.append({"name": f"{feature_name}_oversold", "value": val, "threshold": 30.0, "triggered": True})
                
        # Absolute scale features (rolling_volume_mean, rolling_volume_std, true_range, atr_14d, obv, macd) 
        # deliberately omit hardcoded thresholds as they require dynamic baseline distributions to score properly.

    if isolation_forest_score is not None and isolation_forest_score > 0.65:
        signals.append({
            "name": "isolation_forest_outlier",
            "value": float(isolation_forest_score),
            "threshold": 0.65,
            "triggered": True
        })
        
    if multi_pattern_max_score is not None and multi_pattern_max_score > 0.65:
        signals.append({
            "name": "multi_pattern_classifier",
            "value": float(multi_pattern_max_score),
            "threshold": 0.65,
            "triggered": True
        })

    # Add z_scores to signals if present
    if zscored_features:
        for sig in signals:
            # We map from signal name to the actual feature name by stripping prefixes/suffixes
            fname = sig["name"]
            if fname.startswith("high_"):
                fname = fname[len("high_"):]
            if fname.endswith("_spike"):
                fname = fname[:-len("_spike")]
            if fname.endswith("_overbought"):
                fname = fname[:-len("_overbought")]
            if fname.endswith("_oversold"):
                fname = fname[:-len("_oversold")]

            if fname in zscored_features and zscored_features[fname] is not None:
                try:
                    sig["z_score"] = float(zscored_features[fname])
                except (ValueError, TypeError):
                    sig["z_score"] = None
            else:
                sig["z_score"] = None
    else:
        for sig in signals:
            sig["z_score"] = None

    return signals
