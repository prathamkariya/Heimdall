"""
Phase C: Weak Labeling & Supervised Training on Real Data
This script implements the hybrid weak-labeling pipeline:
1. Loads the z-scored real features (from Phase B).
2. Uses unsupervised anomaly detection (Isolation Forest) to flag outliers.
3. Uses domain-rule prototypes to attribute labels to those outliers (weak labeling).
4. Trains the supervised Multi-Pattern Detector on those weak labels.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd

_HERE = Path(__file__).parent
_SRC = _HERE / ".." / "src"
sys.path.insert(0, str(_SRC.resolve()))
sys.path.insert(0, str(_HERE.resolve()))

from ml.config import BASE_FEATURE_COLUMNS
from ml.detection.weak_labeling import train_multi_pattern_detector_with_weak_labels


def train_weak_supervised(market: str, input_csv: str, output_dir: str,
                          contamination: float = 0.05, random_state: int = 42) -> None:
    print(f"\n=== {market}: Weak Labeling + Supervised MPD Training ===")

    if not Path(input_csv).exists():
        print(f"Skipping {market}: input file {input_csv} not found.")
        return
        
    df = pd.read_csv(input_csv, index_col=0)
    required = set(BASE_FEATURE_COLUMNS) | {"symbol"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing columns: {missing}")

    X = df[BASE_FEATURE_COLUMNS]
    
    print(f"  Training on {len(X)} rows ({df['symbol'].nunique()} symbols).")
    
    detector, weak_labels = train_multi_pattern_detector_with_weak_labels(
        X, contamination=contamination, random_state=random_state
    )

    n_flagged = weak_labels["is_manipulation"].sum()
    print(f"  Flagged {n_flagged} of {len(X)} days ({n_flagged / len(X) * 100:.1f}%) as anomalous.")
    
    for pattern in detector.patterns:
        count = weak_labels[f"is_{pattern.value}"].sum()
        print(f"    - Attributed to {pattern.value}: {int(count)} days")

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    model_path = out / "multi_pattern_detector.joblib"
    joblib.dump(detector, model_path)

    scored_path = out / "weak_labeled_days.csv"
    df_weak = pd.concat([df, weak_labels], axis=1)
    df_weak.to_csv(scored_path)

    metadata = {
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "real-weak-supervised",
        "data_source": input_csv,
        "n_rows": len(X),
        "n_flagged": int(n_flagged),
        "contamination": contamination,
        "random_state": random_state,
        "feature_columns": BASE_FEATURE_COLUMNS,
        "patterns": [p.value for p in detector.patterns],
        "attribution_counts": {
            p.value: int(weak_labels[f"is_{p.value}"].sum()) for p in detector.patterns
        }
    }
    meta_path = out / "multi_pattern_metadata.json"
    meta_path.write_text(json.dumps(metadata, indent=2))

    print(f"  Saved model      -> {model_path}")
    print(f"  Saved labeled CSV-> {scored_path}")
    print(f"  Saved metadata   -> {meta_path}")


if __name__ == "__main__":
    # We load `scored_days.csv` because it contains the z-scored `return` and `volatility_20d` 
    # from Phase B. This is what the prototypes in weak_labeling expect!
    train_weak_supervised(
        "CRYPTO",
        input_csv="trained_models/crypto/scored_days.csv",
        output_dir="trained_models/crypto",
        random_state=42,
    )
    train_weak_supervised(
        "US_EQUITY",
        input_csv="trained_models/us_equity/scored_days.csv",
        output_dir="trained_models/us_equity",
        random_state=43,
    )
