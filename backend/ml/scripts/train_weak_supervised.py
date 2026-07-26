"""
Phase C: Weak Labeling & Supervised Training on Real Data

Updated (plan1.md critical fixes):
  Issue #1 — Confidence Threshold Filtering:
    Weak labels now carry a `label_confidence` score combining softmax
    attribution confidence AND detector agreement. Labels below
    CONFIDENCE_THRESHOLD are discarded before training the MPD, so the
    classifier learns from higher-quality proxy labels rather than treating
    every heuristic attribution as ground truth.

  Issue #2 — Dual Detector:
    train_multi_pattern_detector_with_weak_labels now internally runs both
    IsolationForestScratch and LocalOutlierFactorDetector. Rows flagged by
    both detectors receive higher label_confidence than rows flagged by only
    one, and are therefore more likely to survive the threshold filter.

  Issue #4 — Symbol Leakage Audit:
    Explicit check that metadata columns are absent from the feature matrix
    before fit() is called.

  Issue #7 — Enriched Metadata:
    metadata.json now includes git_commit, dataset_hash, feature_version,
    confidence_threshold, weak_label_version, and n_discarded stats so every
    saved model can be fully reproduced.
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

from ml.config import BASE_FEATURE_COLUMNS, FEATURE_SCHEMA_VERSION
from ml.detection.weak_labeling import (
    train_multi_pattern_detector_with_weak_labels,
    DEFAULT_CONFIDENCE_THRESHOLD,
)

# Metadata columns that must NEVER enter the feature matrix (plan1.md issue #4)
_METADATA_COLUMNS = frozenset({"symbol", "exchange", "market", "asset_id", "ticker"})

CONFIDENCE_THRESHOLD = DEFAULT_CONFIDENCE_THRESHOLD  # 0.70 by default


def _audit_no_leakage(X_df: pd.DataFrame, context: str) -> None:
    """Raise if any known metadata column is present in X_df."""
    leaking = _METADATA_COLUMNS & set(X_df.columns)
    if leaking:
        raise ValueError(
            f"[{context}] Metadata leakage detected — column(s) {sorted(leaking)} must be "
            "removed before fit(). These columns encode symbol/market identity and must "
            "NEVER enter the training feature matrix (plan1.md issue #4)."
        )


def _dataset_hash(df: pd.DataFrame) -> str:
    import hashlib
    return hashlib.sha256(df.to_csv(index=True).encode()).hexdigest()[:16]


def _git_commit() -> str:
    try:
        import subprocess
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=3
        )
        return result.stdout.strip()[:12] if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def train_weak_supervised(
    market: str, input_csv: str, output_dir: str,
    contamination: float = 0.05, random_state: int = 42,
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
) -> None:
    print(f"\n=== {market}: Weak Labeling + Supervised MPD Training ===")
    print(f"  Confidence threshold: {confidence_threshold} "
          f"(labels below this are discarded as low-quality)")

    if not Path(input_csv).exists():
        print(f"Skipping {market}: input file {input_csv} not found.")
        return

    df = pd.read_csv(input_csv, index_col=0)
    required = set(BASE_FEATURE_COLUMNS) | {"symbol"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing columns: {missing}")

    # --- Metadata leakage audit (plan1.md issue #4) ---
    X = df[BASE_FEATURE_COLUMNS]
    _audit_no_leakage(X, context=f"train_weak_supervised({market})")

    print(f"  Training on {len(X)} rows ({df['symbol'].nunique()} symbols).")

    detector, weak_labels = train_multi_pattern_detector_with_weak_labels(
        X, contamination=contamination, random_state=random_state,
        confidence_threshold=confidence_threshold,
    )

    # Stats for reporting
    n_flagged = int(weak_labels["is_manipulation"].sum())
    n_high_conf = int(weak_labels.get("used_in_training", pd.Series(dtype=bool)).sum()
                      if "used_in_training" in weak_labels.columns
                      else n_flagged)
    n_discarded = n_flagged - int(
        weak_labels.loc[weak_labels["is_manipulation"] == 1, "used_in_training"].sum()
        if "used_in_training" in weak_labels.columns else 0
    )

    print(f"  Flagged {n_flagged} of {len(X)} days ({n_flagged / len(X) * 100:.1f}%) as anomalous.")
    print(f"  After confidence filtering: kept {n_flagged - n_discarded}, discarded {n_discarded}.")

    for pattern in detector.patterns:
        count = weak_labels[f"is_{pattern.value}"].sum()
        print(f"    - Attributed to {pattern.value}: {int(count)} days")

    # Agreement stats
    if "detector_agreement" in weak_labels.columns:
        flagged_rows = weak_labels[weak_labels["is_manipulation"] == 1]
        n_both = int((flagged_rows["detector_agreement"] == 1.0).sum())
        n_single = int((flagged_rows["detector_agreement"] == 0.5).sum())
        print(f"  Detector agreement: {n_both} both-agree, {n_single} single-detector")

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    model_path = out / "multi_pattern_detector.joblib"
    joblib.dump(detector, model_path)

    # Save labeled CSV including confidence columns for inspection
    scored_path = out / "weak_labeled_days.csv"
    df_weak = pd.concat([df[BASE_FEATURE_COLUMNS + ["symbol"]], weak_labels], axis=1)
    df_weak.to_csv(scored_path)

    # --- Enriched metadata (plan1.md issue #7) ---
    git_commit = _git_commit()
    dataset_hash = _dataset_hash(df)
    metadata = {
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "real-weak-supervised",
        "data_source": input_csv,
        "git_commit": git_commit,
        "dataset_hash": dataset_hash,
        "feature_version": f"v{FEATURE_SCHEMA_VERSION}",
        "weak_label_version": "v2:dual_detector_if+lof_confidence_filtered",
        "feature_columns": BASE_FEATURE_COLUMNS,
        "n_rows": len(X),
        "n_flagged": n_flagged,
        "n_kept_above_threshold": n_flagged - n_discarded,
        "n_discarded_below_threshold": n_discarded,
        "confidence_threshold": confidence_threshold,
        "contamination": contamination,
        "random_state": random_state,
        "patterns": [p.value for p in detector.patterns],
        "attribution_counts": {
            p.value: int(weak_labels[f"is_{p.value}"].sum()) for p in detector.patterns
        },
    }
    meta_path = out / "multi_pattern_detector_metadata.json"
    meta_path.write_text(json.dumps(metadata, indent=2))

    print(f"  Saved model       -> {model_path}")
    print(f"  Saved labeled CSV -> {scored_path}")
    print(f"  Saved metadata    -> {meta_path}")
    print(f"  Git commit        -> {git_commit}")
    print(f"  Dataset hash      -> {dataset_hash}")


if __name__ == "__main__":
    # We load `scored_days.csv` because it contains the z-scored `return` and `volatility_20d`
    # from Phase B. This is what the prototypes in weak_labeling expect!
    train_weak_supervised(
        "CRYPTO",
        input_csv="trained_models/crypto/scored_days.csv",
        output_dir="trained_models/crypto",
        random_state=42,
        confidence_threshold=CONFIDENCE_THRESHOLD,
    )
    train_weak_supervised(
        "US_EQUITY",
        input_csv="trained_models/us_equity/scored_days.csv",
        output_dir="trained_models/us_equity",
        random_state=43,
        confidence_threshold=CONFIDENCE_THRESHOLD,
    )
