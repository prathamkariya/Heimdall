def severity_for_score(score: float) -> str:
    """
    Computes a severity tier from an anomaly score (0.0 to 1.0).
    Thresholds are a starting proposal and should be revisited once there's
    a real distribution of scores to look at.
    """
    if score >= 0.85:
        return "CRITICAL"
    if score >= 0.65:
        return "HIGH"
    if score >= 0.40:
        return "MEDIUM"
    return "LOW"
