import sys
import json
from pathlib import Path
from datetime import datetime, timezone
import joblib

sys.path.insert(0, '/app/ml/src')

from ml.anomaly.isolation_forest import IsolationForestScratch
from ml.detection.multi_pattern import MultiPatternDetector
from ml.config import BASE_FEATURE_COLUMNS, PatternType
from ml.data.synthetic import generate_synthetic_market_data, PatternInjectionConfig
from sklearn.neighbors import LocalOutlierFactor

out_dir = Path('/models/us_equity')
out_dir.mkdir(parents=True, exist_ok=True)

patterns_cfg = {
    PatternType.PUMP_AND_DUMP: PatternInjectionConfig(n_days=60, return_mean=0.07, return_std=0.015, volume_ratio_mean=3.5, volume_ratio_std=0.4),
    PatternType.WASH_TRADING: PatternInjectionConfig(n_days=70, return_mean=0.0, return_std=0.005, volume_ratio_mean=3.0, volume_ratio_std=0.3),
    PatternType.SPOOFING: PatternInjectionConfig(n_days=50, return_mean=0.0, return_std=0.025, volume_ratio_mean=1.8, volume_ratio_std=0.25),
    PatternType.LAYERING: PatternInjectionConfig(n_days=50, return_mean=0.0, return_std=0.02, volume_ratio_mean=2.2, volume_ratio_std=0.3),
}

print("Generating US Equity synthetic baseline data...")
df = generate_synthetic_market_data(n_days=2500, pattern_configs=patterns_cfg, random_state=42)
X = df[BASE_FEATURE_COLUMNS]

print("Fitting MultiPatternDetector for US_EQUITY...")
mpd = MultiPatternDetector(random_state=42)
mpd.fit(X, df)
joblib.dump(mpd, out_dir / "multi_pattern_detector.joblib")

print("Fitting IsolationForest for US_EQUITY...")
if_model = IsolationForestScratch(n_estimators=100, contamination=0.05, random_state=42)
if_model.fit(X)
joblib.dump(if_model, out_dir / "isolation_forest_scratch.joblib")

print("Fitting LocalOutlierFactor for US_EQUITY...")
lof = LocalOutlierFactor(n_neighbors=20, contamination=0.05, novelty=True)
lof.fit(X.to_numpy(dtype=float))
joblib.dump(lof, out_dir / "local_outlier_factor.joblib")

meta = {
    "trained_at_utc": datetime.now(timezone.utc).isoformat(),
    "market": "US_EQUITY",
    "n_rows": len(df),
    "feature_columns": BASE_FEATURE_COLUMNS,
    "patterns": [p.value for p in mpd.models_.keys()],
}
(out_dir / "metadata.json").write_text(json.dumps(meta, indent=2))
(out_dir / "multi_pattern_detector_metadata.json").write_text(json.dumps(meta, indent=2))
(out_dir / "isolation_forest_metadata.json").write_text(json.dumps(meta, indent=2))

baselines = {
    "AAPL": {"return": {"mean": 0.0008, "std": 0.015}, "volatility_20d": {"mean": 0.014, "std": 0.004}},
    "MSFT": {"return": {"mean": 0.0009, "std": 0.014}, "volatility_20d": {"mean": 0.013, "std": 0.003}},
    "NVDA": {"return": {"mean": 0.0018, "std": 0.028}, "volatility_20d": {"mean": 0.025, "std": 0.008}},
    "TSLA": {"return": {"mean": 0.0015, "std": 0.035}, "volatility_20d": {"mean": 0.032, "std": 0.010}},
    "AMZN": {"return": {"mean": 0.0010, "std": 0.018}, "volatility_20d": {"mean": 0.016, "std": 0.005}},
    "GOOGL": {"return": {"mean": 0.0008, "std": 0.016}, "volatility_20d": {"mean": 0.015, "std": 0.004}},
}
(out_dir / "symbol_baselines.json").write_text(json.dumps(baselines, indent=2))
print("US_EQUITY training and model persistence complete.")
