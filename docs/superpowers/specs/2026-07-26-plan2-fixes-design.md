# ML Pipeline Explainability and Feature Expansion

This document captures the final agreed-upon design for the `plan2.md` ML pipeline fixes, generated via collaborative brainstorming.

## 1. Type Safety and Predictions at the Boundary

We will not refactor the highly performant Pandas-based offline training pipeline to use Python objects. Instead, we use strong typing exclusively at the system boundaries.

### `DetectionResult` and `EvidenceSignal` Dataclasses
Located in a new `backend/ml/src/ml/types.py` file:

```python
from dataclasses import dataclass
from typing import List

@dataclass
class EvidenceSignal:
    name: str
    value: float
    threshold: float
    triggered: bool

@dataclass
class DetectionResult:
    label: str
    confidence: float
    detector_score: float
    detector_agreement: float
    source: str
    evidence: List[EvidenceSignal]
```

These classes serve as the canonical representation for API responses and live inference, providing exact reasoning without artificial "scores" for evidence.

## 2. The Evidence Generator 

We will **not** replace the Nearest-Centroid Euclidean attribution model. It remains the source of truth for the `WeakLabel`.

Instead, an **Evidence Generator** runs *after* the label is assigned. Its sole purpose is to explain *why* a sample exhibits characteristics of that label, creating `EvidenceSignal` objects based on raw feature values crossing defined thresholds.

This ensures:
- The ML engine stays data-driven and statistical (Centroid Distance).
- The explanation layer stays deterministic, readable, and auditable (Evidence Generator).

## 3. Enriched Offline Datasets

For debugging, reproducibility, and future auditing, the offline training dataset (`weak_labeled_days.csv`) will be expanded to include:
- `evidence_json`: A JSON-serialized list of `EvidenceSignal` objects (so offline training runs have exactly the same explainability as live inference).
- `centroid_distance`: The actual Euclidean distance to the winning centroid prototype.

## 4. Extended Feature Engineering & Rolling Context

We will expand `compute_engineered_features()` to include standard technical indicators (MACD, RSI, ATR) and rolling contextual statistics without dropping the base features.

To support this in the live streaming engine:
- We will add `FEATURE_HISTORY_LENGTH` (defaulting to 100) to `ml/config.py`.
- `run_engine.py` will update its Redis `ltrim` to buffer this many observations, allowing indicators like MACD (26-period EMA) time to warm up.
- The feature calculation logic will be written to handle partial histories gracefully (e.g., returning valid base features like `return` and `volume_ratio` even if `MACD` is null due to insufficient history on startup) and will avoid redundantly recalculating entire arrays for every new tick where possible.
