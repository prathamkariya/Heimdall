"""
LocalOutlierFactorDetector — second anomaly detector to cross-validate
the Isolation Forest pipeline.

LOF measures LOCAL density anomalies (is a point sparser than its own
immediate k-nearest-neighbour neighbourhood?) rather than GLOBAL isolation
(is a point far from the entire dataset?). The two detectors catch
genuinely different failure modes:
  - IF excels at globally rare points that sit far from the data cloud.
  - LOF excels at locally sparse pockets that look normal compared to the
    full distribution but are dramatically sparser than their own neighbours.

Practical implication: wash trading on a low-volume day can look globally
normal (the overall distribution already has low-volume days) but locally
anomalous (the point's immediate neighbours are all higher-volume days).
LOF flags this; IF often doesn't. Having both detectors means disagreements
are informative rather than silently ignored.

The `score_samples` convention here matches IsolationForestScratch:
higher score = more anomalous. sklearn's LOF returns negative_outlier_factor_
where more-negative = more-anomalous; we flip and normalize to [0, 1].
"""
from __future__ import annotations

import numpy as np
from sklearn.neighbors import LocalOutlierFactor


class LocalOutlierFactorDetector:
    """Thin wrapper around sklearn's LocalOutlierFactor with the same
    fit / score_samples / predict interface as IsolationForestScratch so
    the two detectors are interchangeable in the dual-detector pipeline.

    Key parameters:
        n_neighbors:   k used for the local density estimate. Larger = more
                       global context; smaller = more sensitive to local
                       pockets. 20 is sklearn's default and works well for
                       general-purpose outlier detection at the scales (5k-25k
                       rows) used in this project.
        contamination: same semantics as IsolationForestScratch — fraction of
                       training points expected to be anomalous, used only to
                       set the binary-prediction threshold at fit() time. Does
                       NOT affect which scores are computed.
        novelty:       MUST remain False here. sklearn's LOF requires
                       novelty=True to call predict/score_samples on new data,
                       but in the offline training pipeline we always score
                       the SAME data the model was fit on. Setting novelty=True
                       would change the memory footprint and require storing
                       the full training set — unnecessary for this use case.
    """

    def __init__(
        self,
        n_neighbors: int = 20,
        contamination: float = 0.05,
        random_state: int = 42,  # kept for API symmetry with IsolationForestScratch; LOF is deterministic
    ):
        self.n_neighbors = n_neighbors
        self.contamination = contamination
        self.random_state = random_state  # unused but keeps constructor symmetric

        self._lof: LocalOutlierFactor | None = None
        self._scores: np.ndarray | None = None  # cached raw scores from fit
        self.threshold_: float | None = None

    def fit(self, X: np.ndarray) -> LocalOutlierFactorDetector:
        """Fit LOF on X and fix the anomaly threshold from contamination.

        sklearn's LOF with novelty=False computes negative_outlier_factor_
        (the sign-flipped LOF score) as a side-effect of fit_predict.
        We cache those raw scores (as positive, higher = more anomalous)
        so score_samples can return them without re-fitting.
        """
        X = np.asarray(X, dtype=float)
        self._lof = LocalOutlierFactor(
            n_neighbors=self.n_neighbors,
            contamination=self.contamination,
            novelty=False,
        )
        self._lof.fit_predict(X)  # side-effect: populates negative_outlier_factor_

        # negative_outlier_factor_ is already negative — flip so higher = more anomalous
        raw_scores = -self._lof.negative_outlier_factor_

        # Min-max normalize to [0, 1] across the training set so scores are
        # directly comparable to IsolationForestScratch's [0, 1] range.
        score_min = raw_scores.min()
        score_max = raw_scores.max()
        if score_max > score_min:
            self._scores = (raw_scores - score_min) / (score_max - score_min)
        else:
            self._scores = np.zeros_like(raw_scores)

        # Fix threshold at fit() time, same convention as IsolationForestScratch
        self.threshold_ = float(np.quantile(self._scores, 1 - self.contamination))
        self._score_min = score_min
        self._score_max = score_max
        return self

    def score_samples(self, X: np.ndarray) -> np.ndarray:
        """Return anomaly scores for each row in X. Higher = more anomalous.

        NOTE: sklearn's non-novelty LOF can ONLY score the training data —
        it has no mechanism to score new points without refitting. For the
        offline training pipeline (where we always score training data) this
        is fine. The live-inference path in anomaly_service.py uses
        IsolationForestScratch for real-time single-point scoring; this class
        is only used at training time. Calling score_samples with new data
        beyond the training set is intentionally not supported.
        """
        if self._scores is None or self._lof is None:
            raise RuntimeError("Call fit() before score_samples().")
        X = np.asarray(X, dtype=float)
        # If called on the same training data (only supported case), return
        # the cached normalized scores. We check by shape — a shape mismatch
        # means the caller is trying to score new data, which is unsupported.
        if X.shape[0] == len(self._scores):
            return self._scores.copy()
        raise ValueError(
            "LocalOutlierFactorDetector.score_samples() can only score the exact training "
            "data it was fit on (same number of rows). For new-data scoring, use "
            "IsolationForestScratch which supports out-of-sample prediction. "
            f"Expected {len(self._scores)} rows, got {X.shape[0]}."
        )

    def predict(self, X: np.ndarray) -> np.ndarray:
        """1 = anomaly, 0 = normal, using the threshold set at fit() time."""
        if self.threshold_ is None:
            raise RuntimeError("Call fit() before predict().")
        scores = self.score_samples(X)
        return (scores >= self.threshold_).astype(int)
