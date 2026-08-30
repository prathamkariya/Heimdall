"""
regen_input_csvs.py — Regenerate real_if_input.csv for each market using the
current BASE_FEATURE_COLUMNS schema (v2, 12 features).

The existing real_if_input.csv files were generated with the old 3-feature
schema. The training scripts (train_zscored.py, train_weak_supervised.py)
now validate against BASE_FEATURE_COLUMNS, so they fail on the old CSVs.

This script reads the existing CSVs (which contain 'close' and 'volume'),
recomputes all features via compute_engineered_features(), drops NaN warmup
rows on all BASE_FEATURE_COLUMNS, and overwrites real_if_input.csv in place.

Run ONCE before train_zscored.py + train_weak_supervised.py:
    cd backend
    python scripts/regen_input_csvs.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

_HERE = Path(__file__).parent        # backend/scripts/
_BACKEND = _HERE.parent              # backend/
_ML_SRC = _BACKEND / "ml" / "src"
sys.path.insert(0, str(_ML_SRC))

from ml.config import BASE_FEATURE_COLUMNS
from ml.data.synthetic import compute_engineered_features


MARKETS = [
    ("crypto",    _BACKEND / "trained_models" / "CRYPTO"    / "real_if_input.csv"),
    ("us_equity", _BACKEND / "trained_models" / "US_EQUITY" / "real_if_input.csv"),
]


def regen(market: str, src_path: Path) -> None:
    print(f"\n=== {market.upper()}: regenerating real_if_input.csv ===")
    if not src_path.exists():
        print(f"  SKIP: {src_path} not found")
        return

    df = pd.read_csv(src_path, index_col=0)
    print(f"  Loaded {len(df)} rows, columns: {list(df.columns)}")

    required = {"close", "volume", "symbol"}
    missing = required - set(df.columns)
    if missing:
        print(f"  ERROR: missing columns {sorted(missing)} — cannot regenerate")
        return

    # Recompute features per symbol (same discipline as prepare_real_data.py)
    frames = []
    for sym, grp in df.groupby("symbol"):
        grp = grp.sort_index()
        feat = compute_engineered_features(grp[["close", "volume"]])
        feat["symbol"] = sym
        n_before = len(feat)
        feat = feat.dropna(subset=BASE_FEATURE_COLUMNS)
        dropped = n_before - len(feat)
        print(f"    {sym}: {len(feat)} usable rows (dropped {dropped} warmup rows)")
        frames.append(feat)

    if not frames:
        print("  ERROR: no data produced — aborting")
        return

    out = pd.concat(frames)
    out.to_csv(src_path)
    print(f"  Wrote {len(out)} rows to {src_path}")
    print(f"  Columns now: {list(out.columns)}")


if __name__ == "__main__":
    for market, path in MARKETS:
        regen(market, path)
    print("\nDone. Now run:")
    print("  python ml/scripts/train_zscored.py")
    print("  python ml/scripts/train_weak_supervised.py")
