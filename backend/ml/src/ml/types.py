from dataclasses import dataclass
from typing import List, Optional

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
