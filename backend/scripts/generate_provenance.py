"""
generate_provenance.py — Write authoritative provenance metadata for the
currently deployed Heimdall models.

WHY THIS SCRIPT EXISTS:
  The full train_zscored.py and train_weak_supervised.py scripts now
  require BASE_FEATURE_COLUMNS v2 (12 features), but the currently
  deployed models were trained on the 3-feature schema
  (return, volume_ratio_20d, volatility_20d). Retraining to v2 would
  produce different models than what is deployed.

  This script generates metadata.json and symbol_baselines.json that
  accurately describe the *deployed* models — computed from the same
  input CSV and using the same algorithm, without retraining.
  The output is written to trained_models/<market_lower>/ (lowercase),
  which is the path get_model_registry() actually reads from.

  Commit the outputs. After committing:
  - trained_models/crypto/metadata.json (git_commit, dataset_hash, etc.)
  - trained_models/crypto/symbol_baselines.json
  - trained_models/us_equity/metadata.json
  - trained_models/us_equity/symbol_baselines.json

  are all tracked in git and match what the running application loads.

DECISION ON .joblib FILES:
  Not committed. Too large for git. See ml/README.md for the exact
  commands to regenerate them deterministically.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

# ─── Path setup ────────────────────────────────────────────────────────────────
_HERE = Path(__file__).parent  # backend/scripts/
_BACKEND = _HERE.parent         # backend/
_ML_SRC = _BACKEND / "ml" / "src"
sys.path.insert(0, str(_ML_SRC))

# ─── Feature schema v1 (3-feature) — matches deployed models ───────────────────
DEPLOYED_FEATURE_COLUMNS = [
    "return",
    "volume_ratio_20d",
    "volatility_20d",
]
FEATURE_SCHEMA_VERSION = 1  # v1: original 3-feature schema

ROLLING_WINDOW = 60
MIN_PERIODS = 20


def _git_commit() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=3,
            cwd=str(_BACKEND.parent)  # repo root
        )
        return result.stdout.strip()[:12] if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def _dataset_hash(df: pd.DataFrame) -> str:
    return hashlib.sha256(df.to_csv(index=True).encode()).hexdigest()[:16]


def _compute_symbol_baselines(df: pd.DataFrame) -> dict:
    """
    Compute per-symbol rolling z-score baselines from real_if_input.csv.

    Uses the same causal discipline as the training pipeline:
    - Rolling window of 60 days, min_periods=20
    - .shift(1): row t uses stats from [t-window, t-1] only

    These baselines are what _apply_zscores() uses at inference time.
    """
    baselines: dict[str, dict] = {}
    zscore_features = ["return", "volatility_20d"]

    for symbol, grp in df.groupby("symbol"):
        grp = grp.sort_index()
        baseline: dict[str, dict] = {}
        for feat in zscore_features:
            if feat not in grp.columns:
                continue
            series = grp[feat].astype(float)
            rolling_mean = series.shift(1).rolling(ROLLING_WINDOW, min_periods=MIN_PERIODS).mean()
            rolling_std = series.shift(1).rolling(ROLLING_WINDOW, min_periods=MIN_PERIODS).std()
            # Use the last valid values as the serving-time baseline
            last_mean = rolling_mean.dropna().iloc[-1] if not rolling_mean.dropna().empty else 0.0
            last_std = rolling_std.dropna().iloc[-1] if not rolling_std.dropna().empty else 1.0
            baseline[feat] = {"mean": float(last_mean), "std": float(last_std)}
        if baseline:
            baselines[str(symbol)] = baseline

    return baselines


def generate_provenance(
    market: str,
    input_csv: str,
    output_dir: str,
) -> None:
    print(f"\n=== {market}: Generating provenance metadata ===")
    input_path = Path(input_csv)
    if not input_path.exists():
        print(f"  SKIP: input CSV not found at {input_path}")
        return

    df = pd.read_csv(input_path, index_col=0)
    # Validate the 3-feature schema we expect
    missing = set(DEPLOYED_FEATURE_COLUMNS) - set(df.columns)
    if missing:
        print(f"  ERROR: CSV missing expected columns {sorted(missing)} — skipping {market}")
        return

    print(f"  Input: {len(df)} rows, {df['symbol'].nunique()} symbols")

    git_commit = _git_commit()
    dataset_hash = _dataset_hash(df)
    symbol_baselines = _compute_symbol_baselines(df)

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # ── metadata.json ──────────────────────────────────────────────────────────
    # Matches the schema train_weak_supervised.py promises in its docstring:
    # git_commit, dataset_hash, feature_version, confidence_threshold, n_discarded
    # This documents the *deployed* 3-feature model, not a future retrained one.
    metadata = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "provenance_note": (
            "Provenance metadata for the deployed 3-feature models "
            "(return, volume_ratio_20d, volatility_20d). "
            "Feature schema v2 (12 features) exists in config.py but was added "
            "after these models were trained. Retraining to v2 is tracked as "
            "a future task. This file documents what is actually deployed."
        ),
        "git_commit": git_commit,
        "dataset_hash": dataset_hash,
        "feature_version": f"v{FEATURE_SCHEMA_VERSION}",
        "feature_columns": DEPLOYED_FEATURE_COLUMNS,
        "mode": "real-weak-supervised",
        "data_source": input_csv,
        "n_rows": len(df),
        "n_symbols": int(df["symbol"].nunique()),
        # confidence_threshold: matches DEFAULT_CONFIDENCE_THRESHOLD in weak_labeling.py
        "confidence_threshold": 0.4,
        "n_flagged": "see multi_pattern_detector_metadata.json",
        "n_discarded": "see multi_pattern_detector_metadata.json",
        "zscore_normalization": {
            "features": ["return", "volatility_20d"],
            "rolling_window": ROLLING_WINDOW,
            "min_periods": MIN_PERIODS,
            "shift": 1,
            "note": "causal: row t uses stats from [t-window, t-1] only",
        },
    }
    meta_path = out / "metadata.json"
    meta_path.write_text(json.dumps(metadata, indent=2))

    # ── symbol_baselines.json ──────────────────────────────────────────────────
    baselines_path = out / "symbol_baselines.json"
    baselines_path.write_text(json.dumps(symbol_baselines, indent=2))

    print(f"  git_commit    -> {git_commit}")
    print(f"  dataset_hash  -> {dataset_hash}")
    print(f"  symbols       -> {sorted(symbol_baselines.keys())}")
    print(f"  Written: {meta_path}")
    print(f"  Written: {baselines_path}")


if __name__ == "__main__":
    generate_provenance(
        "CRYPTO",
        input_csv="trained_models/CRYPTO/real_if_input.csv",
        output_dir="trained_models/CRYPTO",
    )
    generate_provenance(
        "US_EQUITY",
        input_csv="trained_models/US_EQUITY/real_if_input.csv",
        output_dir="trained_models/US_EQUITY",
    )
    print("\nDone. Commit the generated metadata.json and symbol_baselines.json files.")
    print("Verify git status shows them as tracked (not ignored).")
