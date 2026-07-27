"""
Weak Labeling: bridging unsupervised anomaly detection and per-pattern
supervised classification, without requiring true labels.

THE TENSION THIS RESOLVES: MultiPatternDetector (detection/multi_pattern.py)
is the more sophisticated architecture -- proven, in compare_against_blended_baseline,
to genuinely out-detect a single blended-label model. But it needs
per-pattern GROUND TRUTH LABELS. Most real deployments don't have those --
that's the whole reason surveillance exists in the first place. Meanwhile
IsolationForestScratch (anomaly/isolation_forest.py) needs no labels at
all, but only ever says "this looks weird," never WHICH KIND of weird.

This module is the bridge: once IsolationForest flags a day as
anomalous, ATTRIBUTE a likely pattern to it via nearest-centroid matching
in feature space against reference prototypes -- built either from a
handful of confirmed true examples (few-shot: "I know of 3 confirmed
pump-and-dump days"), or from pure domain knowledge with ZERO true
examples at all (the harder, more interesting case, and the one this
module treats as the default).

DUAL-DETECTOR PIPELINE (plan1.md issue #2):
Instead of trusting a single Isolation Forest, we cross-validate with a
Local Outlier Factor detector. Detector agreement is computed as:
  - both detectors flag the row: agreement = 1.0 (high confidence)
  - only one detector flags the row: agreement = 0.5 (moderate confidence)
This agreement score is folded into the overall weak-label confidence,
reducing false positives that arise when only one detector fires.

CONFIDENCE THRESHOLD FILTERING (plan1.md issue #1):
Every generated weak label carries a confidence score (combining softmax
attribution confidence + detector agreement). Labels below a configurable
confidence_threshold are excluded from supervised training rather than
treated as ground truth. The default (0.70) is conservative -- lower to
increase training set size at the cost of label precision.

HONESTY, not optimism: weak labels are NOT ground truth. Every function
here that produces them is paired with a validation function
(evaluate_weak_labeling_quality) that measures, against synthetic data
with KNOWN true labels, exactly how much is lost by using this bridge
instead of real labels -- a measured tradeoff, not a hopeful claim.
Real deployments won't have that ground truth to check against; the
measurement here is what tells you how much to trust the bridge when
you can't check it directly.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import json
from dataclasses import asdict
from sklearn.metrics import roc_auc_score, confusion_matrix

from ml.config import PatternType, BASE_FEATURE_COLUMNS, RANDOM_STATE
from ml.anomaly.isolation_forest import IsolationForestScratch
from ml.anomaly.local_outlier_factor import LocalOutlierFactorDetector
from ml.detection.multi_pattern import MultiPatternDetector
from ml.types import EvidenceSignal

# Default confidence threshold: labels below this are excluded from training.
# Calibrated against real Binance 1m data: with 4 patterns the softmax max
# achievable is ~0.84, and both-detector-agree rows sit at median ~0.47.
# The 0.40 cutoff (p25 of both-agree rows) keeps high-quality labels while
# discarding the lowest-confidence single-detector attributions.
# - > 0.65: conservative (both-agree strong attributions only)
# - 0.40\u20130.65: balanced (default, includes most both-agree rows)
# - < 0.40: aggressive (includes many single-detector attributions)
DEFAULT_CONFIDENCE_THRESHOLD = 0.40


def build_pattern_prototypes_from_examples(
    X: pd.DataFrame, label_df: pd.DataFrame, patterns: list[PatternType] | None = None,
) -> dict[PatternType, np.ndarray]:
    """Few-shot case: build each pattern's prototype as the mean
    STANDARDIZED feature vector across whatever confirmed true examples
    you have -- even a handful (3-5 confirmed incidents) is enough to
    define a centroid, though more examples make it more reliable.

    Standardized (z-scored) against X's own mean/std, not raw feature
    values -- this is what lets a prototype built on one stock's price
    scale still make sense when attributing anomalies on a different
    stock with a completely different price range.
    """
    if patterns is None:
        patterns = list(PatternType)
    X_mean, X_std = X.mean(), X.std()
    X_standardized = (X - X_mean) / X_std

    prototypes = {}
    for pattern in patterns:
        label_col = f"is_{pattern.value}"
        if label_col not in label_df.columns:
            raise ValueError(f"label_df is missing column '{label_col}' for pattern {pattern.value}.")
        mask = label_df[label_col] == 1
        if mask.sum() == 0:
            raise ValueError(
                f"No confirmed examples for pattern '{pattern.value}' in label_df -- "
                f"cannot build a prototype from zero examples. Use "
                f"build_pattern_prototypes_from_domain_rules for patterns with no "
                f"confirmed examples at all."
            )
        prototypes[pattern] = X_standardized.loc[mask].mean().values
    return prototypes


def build_pattern_prototypes_from_domain_rules() -> dict[PatternType, np.ndarray]:
    """Zero-example case: prototypes built from pure domain reasoning
    about what each pattern's signature typically looks like in
    STANDARDIZED (z-scored) return / volume_ratio_20d / volatility_20d
    space -- the same directional reasoning that went into designing
    data/synthetic.py's DEFAULT_PATTERN_CONFIGS in the first place, made
    explicit and reusable here rather than left implicit in a data
    generator.

    Directional, not exact-magnitude: these represent RELATIVE
    positioning (e.g. "high positive return, high volume") in z-score
    units, not literal numbers from any one dataset -- because they're
    z-scored against WHATEVER dataset attribute_pattern_to_anomalies is
    later called on, they adapt to that dataset's own scale rather than
    assuming synthetic-data-specific magnitudes.

    Ordered [return_z, volume_ratio_z, volatility_z] to match BASE_FEATURE_COLUMNS.
    """
    n_features = len(BASE_FEATURE_COLUMNS)
    
    def pad(arr):
        padded = np.zeros(n_features)
        padded[:3] = arr
        return padded

    return {
        PatternType.PUMP_AND_DUMP: pad([2.5, 2.5, 1.0]),   # strong positive return + high volume
        PatternType.WASH_TRADING: pad([0.0, 2.5, 0.5]),    # ~zero return + high volume
        PatternType.SPOOFING: pad([0.0, 0.8, 1.8]),        # ~zero return + moderate volume + high volatility
        PatternType.LAYERING: pad([0.0, 1.3, 1.5]),        # ~zero return + moderate-high volume + high volatility
    }


def attribute_pattern_to_anomalies(
    X: pd.DataFrame, flagged_mask: np.ndarray, prototypes: dict[PatternType, np.ndarray],
) -> pd.DataFrame:
    """For each flagged (anomalous) row, find the nearest prototype by
    Euclidean distance in standardized feature space, and report both
    the attributed pattern and a confidence score.

    confidence is a softmax over NEGATIVE distances (closer prototype ->
    higher confidence) -- NOT a calibrated probability, just a relative
    measure of how much closer the winning prototype was than the
    runners-up. A confidence near 1/n_patterns means the attribution is
    barely better than a guess; that's meaningful information for a
    human reviewer, not a footnote to hide.
    """
    if not prototypes:
        raise ValueError(
            "prototypes is empty -- there is nothing to attribute flagged "
            "anomalies to. Pass at least one pattern's prototype, or use "
            "build_pattern_prototypes_from_domain_rules()/"
            "build_pattern_prototypes_from_examples() to build some."
        )

    X_mean, X_std = X.mean(), X.std()
    X_standardized = ((X - X_mean) / X_std).values

    pattern_list = list(prototypes.keys())
    prototype_matrix = np.array([prototypes[p] for p in pattern_list])

    results = []
    for i in range(len(X)):
        if not flagged_mask[i]:
            results.append({"attributed_pattern": None, "confidence": None, "centroid_distance": None})
            continue
        point = X_standardized[i]
        distances = np.sqrt(((prototype_matrix - point) ** 2).sum(axis=1))
        # softmax over negative distances -- closer = higher score
        neg_distances = -distances
        exp_scores = np.exp(neg_distances - neg_distances.max())
        softmax_scores = exp_scores / exp_scores.sum()
        best_idx = np.argmax(softmax_scores)
        results.append({
            "attributed_pattern": pattern_list[best_idx].value,
            "confidence": float(softmax_scores[best_idx]),
            "centroid_distance": float(distances[best_idx]),
        })
    return pd.DataFrame(results, index=X.index)


def weak_label_from_isolation_forest(
    X: pd.DataFrame, prototypes: dict[PatternType, np.ndarray] | None = None,
    contamination: float = 0.05, n_estimators: int = 100, random_state: int = RANDOM_STATE,
    lof_n_neighbors: int = 20,
) -> pd.DataFrame:
    """Full bridge pipeline: fit IsolationForestScratch AND LocalOutlierFactor
    unsupervised (no labels needed), cross-validate their flags via detector
    agreement, attribute a likely pattern to each row flagged by either
    detector, and return a DataFrame with is_{pattern} columns in EXACTLY the
    schema data/synthetic.py produces and MultiPatternDetector expects.

    DUAL DETECTOR (plan1.md issue #2):
    - IF and LOF each produce independent binary flags.
    - A row is considered anomalous if flagged by EITHER detector.
    - detector_agreement is 1.0 if both agree, 0.5 if only one fires.
    - This agreement score is folded into the final label confidence to
      down-weight attributions backed by only one detector.

    CONFIDENCE SCORING (plan1.md issue #1):
    - final_confidence = softmax_attribution_confidence * detector_agreement
    - Stored in `label_confidence` column for downstream filtering.

    prototypes defaults to build_pattern_prototypes_from_domain_rules()
    if not given -- the zero-example case.
    """
    if prototypes is None:
        prototypes = build_pattern_prototypes_from_domain_rules()

    # === Isolation Forest ===
    iso_forest = IsolationForestScratch(
        n_estimators=n_estimators, contamination=contamination, random_state=random_state,
    )
    iso_forest.fit(X.values)
    if_flags = iso_forest.predict(X.values).astype(bool)

    # === Local Outlier Factor ===
    lof_detector = LocalOutlierFactorDetector(
        n_neighbors=lof_n_neighbors, contamination=contamination, random_state=random_state,
    )
    lof_detector.fit(X.values)
    lof_flags = lof_detector.predict(X.values).astype(bool)

    # === Detector Agreement ===
    # A row is flagged if EITHER detector fires (union) so we don't miss
    # LOF-only local-density anomalies or IF-only global outliers.
    flagged_mask = if_flags | lof_flags
    both_agree = if_flags & lof_flags
    detector_agreement = np.where(both_agree, 1.0, 0.5)  # shape (n,)
    # Normal rows (not flagged by either) get agreement = 0 by convention
    detector_agreement = np.where(flagged_mask, detector_agreement, 0.0)

    # === Pattern Attribution ===
    attribution = attribute_pattern_to_anomalies(X, flagged_mask, prototypes)

    # === Fold agreement into confidence ===
    # softmax_confidence is in (0, 1]; agreement is 0.5 or 1.0 for flagged rows.
    # Multiplying gives label_confidence that's strictly lower for single-detector
    # attributions — exactly the down-weighting plan1.md requires.
    attribution_conf = attribution["confidence"].fillna(0.0).values
    label_confidence = attribution_conf * detector_agreement

    # === Evidence Generation ===
    # Using the raw feature values in X, we determine which thresholds were crossed.
    # This explains the label *after* the centroid distance decided it.
    evidence_jsons = []
    for i in range(len(X)):
        if not flagged_mask[i]:
            evidence_jsons.append(json.dumps([]))
            continue
        
        row = X.iloc[i]
        ev_list = []
        
        # Heuristic thresholds for explanation
        vr = float(row.get("volume_ratio_20d", 0))
        if vr > 1.5:
            ev_list.append(asdict(EvidenceSignal(name="volume_spike", value=vr, threshold=1.5, triggered=True)))
            
        vol = float(row.get("volatility_20d", 0))
        if vol > 0.8:
            ev_list.append(asdict(EvidenceSignal(name="high_volatility", value=vol, threshold=0.8, triggered=True)))
            
        ret = float(row.get("return", 0))
        if abs(ret) > 0.05:
            ev_list.append(asdict(EvidenceSignal(name="large_return", value=ret, threshold=0.05, triggered=True)))

        evidence_jsons.append(json.dumps(ev_list))

    weak_labels = pd.DataFrame(index=X.index)
    for pattern in prototypes:
        weak_labels[f"is_{pattern.value}"] = (
            (attribution["attributed_pattern"] == pattern.value)
        ).astype(int)
    weak_labels["is_manipulation"] = flagged_mask.astype(int)
    weak_labels["attribution_confidence"] = attribution_conf
    weak_labels["detector_agreement"] = detector_agreement
    weak_labels["label_confidence"] = label_confidence  # primary filtering field
    weak_labels["centroid_distance"] = attribution["centroid_distance"].fillna(0.0).values
    weak_labels["evidence_json"] = evidence_jsons
    return weak_labels


def train_multi_pattern_detector_with_weak_labels(
    X: pd.DataFrame, prototypes: dict[PatternType, np.ndarray] | None = None,
    contamination: float = 0.05, random_state: int = RANDOM_STATE,
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
    lof_n_neighbors: int = 20,
) -> tuple[MultiPatternDetector, pd.DataFrame]:
    """Bootstraps a MultiPatternDetector using weak labels instead of
    true ones. Returns both the fitted detector AND the weak_labels used
    to fit it (AFTER confidence filtering), so a caller can inspect exactly
    what the model was actually trained on.

    CONFIDENCE FILTERING (plan1.md issue #1):
    Rows where `label_confidence` < confidence_threshold are excluded from
    the supervised training set. These rows are kept in the returned
    weak_labels DataFrame with a `used_in_training` column set to False
    so callers can see exactly what was filtered. The three tiers are:
        > 0.90  Training   (both detectors agree, strong attribution)
        0.70–0.90 Training (borderline — included by default)
        < 0.70  Discarded  (single-detector attribution with low softmax)

    DUAL DETECTOR (plan1.md issue #2):
    Internally calls weak_label_from_isolation_forest which now runs both
    IsolationForestScratch and LocalOutlierFactorDetector. See that
    function's docstring for agreement semantics.

    Patterns with zero high-confidence weakly-labeled positive examples are
    silently excluded (a real possibility if all flagged days are below the
    confidence threshold) rather than crashing the whole pipeline.
    """
    resolved_prototypes = prototypes if prototypes is not None else build_pattern_prototypes_from_domain_rules()
    weak_labels = weak_label_from_isolation_forest(
        X, prototypes=resolved_prototypes, contamination=contamination,
        random_state=random_state, lof_n_neighbors=lof_n_neighbors,
    )

    # Mark which rows meet the confidence threshold for training
    high_conf_mask = (
        weak_labels["is_manipulation"] == 1
    ) & (
        weak_labels["label_confidence"] >= confidence_threshold
    )
    # Normal (non-manipulation) rows are always included — they don't need
    # confidence because they were never flagged to begin with.
    training_mask = (weak_labels["is_manipulation"] == 0) | high_conf_mask
    weak_labels["used_in_training"] = training_mask

    X_train = X.loc[training_mask]
    weak_labels_train = weak_labels.loc[training_mask]

    n_total = int(weak_labels["is_manipulation"].sum())
    n_kept = int(high_conf_mask.sum())
    n_discarded = n_total - n_kept
    import logging
    logger = logging.getLogger(__name__)
    logger.info(
        "Confidence filtering: kept %d / %d anomalous weak labels (discarded %d below threshold=%.2f)",
        n_kept, n_total, n_discarded, confidence_threshold,
    )

    patterns_with_positives = [
        p for p in resolved_prototypes
        if weak_labels_train[f"is_{p.value}"].sum() > 0
    ]
    if not patterns_with_positives:
        raise RuntimeError(
            f"Zero patterns have any high-confidence weakly-labeled positive examples after "
            f"filtering at confidence_threshold={confidence_threshold}. "
            f"Try lowering confidence_threshold (current: {confidence_threshold}), increasing "
            f"contamination so more days get flagged, or check that prototypes are "
            f"reasonable for this data's scale."
        )
    detector = MultiPatternDetector(patterns=patterns_with_positives, random_state=random_state)
    detector.fit(X_train, weak_labels_train)
    return detector, weak_labels


def evaluate_weak_labeling_quality(
    X: pd.DataFrame, true_label_df: pd.DataFrame, X_test: pd.DataFrame, true_label_df_test: pd.DataFrame,
    prototypes: dict[PatternType, np.ndarray] | None = None,
    contamination: float = 0.05, random_state: int = RANDOM_STATE,
) -> dict:
    """THE validation function this whole module rests on: measures,
    against data where true labels ARE available (synthetic, or a
    validation slice of real data with confirmed incidents), exactly how
    much is lost by using the weak-labeling bridge instead of true labels.

    Three separate, honestly-reported numbers, because they measure
    three DIFFERENT bottlenecks that a single "accuracy" figure would
    blur together:
      1. isolation_forest_recall_per_pattern: of the TRUE anomalies of
         each pattern, what fraction does IsolationForest even flag in
         the first place? A pattern IF rarely flags can never be
         correctly weak-labeled no matter how good attribution is --
         this bottleneck is entirely upstream of attribution.
      2. attribution_accuracy_given_flagged: of days IF DID flag, how
         often does nearest-centroid attribution assign the CORRECT
         pattern (vs. a wrong one)? Isolates the attribution step's own
         quality, given a day was already correctly flagged as anomalous.
      3. downstream_auc_true_vs_weak: trains MultiPatternDetector twice
         (once on true labels, once on weak labels from THIS pipeline)
         and compares per-pattern test AUC -- the actual bottom-line
         answer to "how much detection quality do you lose."
    """
    if prototypes is None:
        prototypes = build_pattern_prototypes_from_domain_rules()

    weak_labels_train = weak_label_from_isolation_forest(
        X, prototypes=prototypes, contamination=contamination, random_state=random_state,
    )

    # 1. IsolationForest's own recall per pattern (upstream bottleneck)
    if_recall_rows = []
    for pattern in prototypes:
        true_col = f"is_{pattern.value}"
        if true_col not in true_label_df.columns:
            continue
        true_positive_mask = true_label_df[true_col] == 1
        if true_positive_mask.sum() == 0:
            continue
        flagged_among_true_positives = weak_labels_train.loc[true_positive_mask, "is_manipulation"].mean()
        if_recall_rows.append({"pattern": pattern.value, "isolation_forest_recall": float(flagged_among_true_positives)})
    if_recall_df = pd.DataFrame(if_recall_rows)

    # 2. Attribution accuracy given a day was already correctly flagged
    combined_true_positive = (true_label_df[[f"is_{p.value}" for p in prototypes if f"is_{p.value}" in true_label_df.columns]].sum(axis=1) > 0)
    correctly_flagged_true_positives = combined_true_positive & (weak_labels_train["is_manipulation"] == 1)

    if correctly_flagged_true_positives.sum() > 0:
        true_pattern_for_flagged = true_label_df.loc[correctly_flagged_true_positives, [f"is_{p.value}" for p in prototypes]].idxmax(axis=1).str.replace("is_", "")
        weak_pattern_for_flagged = weak_labels_train.loc[correctly_flagged_true_positives, [f"is_{p.value}" for p in prototypes]].idxmax(axis=1).str.replace("is_", "")
        attribution_accuracy = float((true_pattern_for_flagged.values == weak_pattern_for_flagged.values).mean())
        attribution_confusion = confusion_matrix(true_pattern_for_flagged, weak_pattern_for_flagged, labels=[p.value for p in prototypes])
    else:
        attribution_accuracy = float("nan")
        attribution_confusion = None

    # 3. Downstream detection quality: true labels vs weak labels
    true_detector = MultiPatternDetector(patterns=list(prototypes.keys()), random_state=random_state)
    true_detector.fit(X, true_label_df)
    true_eval = true_detector.evaluate(X_test, true_label_df_test)

    weak_detector, _ = train_multi_pattern_detector_with_weak_labels(
        X, prototypes=prototypes, contamination=contamination, random_state=random_state,
    )
    # evaluate the weak-label-trained detector against TRUE test labels --
    # the whole point is measuring against reality, not against more weak labels
    weak_eval_rows = []
    for pattern in weak_detector.models_:
        true_col = f"is_{pattern.value}"
        if true_col not in true_label_df_test.columns:
            continue
        y_true = true_label_df_test[true_col]
        y_proba = weak_detector.predict_proba(X_test)[f"proba_{pattern.value}"]
        weak_eval_rows.append({
            "pattern": pattern.value,
            "auc": roc_auc_score(y_true, y_proba) if y_true.sum() > 0 else float("nan"),
        })
    weak_eval = pd.DataFrame(weak_eval_rows)

    comparison = true_eval[["pattern", "auc"]].merge(
        weak_eval, on="pattern", how="outer", suffixes=("_true_labels", "_weak_labels")
    )
    missing_mask = comparison["auc_weak_labels"].isna()
    if missing_mask.any():
        import logging
        logging.warning("Patterns failed to train in weak labeling: %s", comparison.loc[missing_mask, "pattern"].tolist())
        comparison["auc_weak_labels"] = comparison["auc_weak_labels"].fillna(0.5)

    comparison["auc_lost"] = comparison["auc_true_labels"] - comparison["auc_weak_labels"]

    return {
        "isolation_forest_recall_per_pattern": if_recall_df,
        "attribution_accuracy_given_flagged": attribution_accuracy,
        "attribution_confusion_matrix": attribution_confusion,
        "downstream_auc_comparison": comparison,
    }
