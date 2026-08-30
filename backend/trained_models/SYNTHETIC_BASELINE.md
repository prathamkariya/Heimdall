# trained_models/SYNTHETIC_BASELINE.md

This directory previously contained a `metadata.json` at the root level (now
renamed to `SYNTHETIC_BASELINE_metadata.json` here) that held evaluation
results from an early **synthetic-data** training run. It is preserved here
for reference only.

## What this was

The original `trained_models/metadata.json` (mode: `"synthetic"`) contains:
- AUC / precision / recall / F1 numbers for the MultiPatternDetector trained
  on synthetic OHLCV data, not real market data
- `n_positive` counts of 5–18 (very small, purely from synthetic injection)
- A blended-vs-per-pattern comparison as a methodology sanity-check

These numbers are **not** the production model's metrics. The production model
was trained on real market data (see `CRYPTO/multi_pattern_detector_metadata.json`
and `US_EQUITY/multi_pattern_detector_metadata.json` for the real evaluation).

## Why it existed at the repo root

The early training script (`scripts/train.py --mode synthetic`) wrote its
output to `trained_models/` directly without a market subdirectory. Later runs
added per-market subdirectories (`CRYPTO/`, `US_EQUITY/`). The root file was
never cleaned up.

## What to use instead

| Question | Answer |
|---|---|
| What are the production model's real evaluation numbers? | `trained_models/CRYPTO/multi_pattern_detector_metadata.json` |
| What input data were the production models trained on? | `trained_models/CRYPTO/real_if_input.csv` |
| What git commit produced these models? | `trained_models/CRYPTO/metadata.json` → `git_commit` field |
| How do I reproduce the models? | See `ml/README.md` → "Model reproducibility and provenance" |
