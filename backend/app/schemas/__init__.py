from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator, ConfigDict, computed_field


# ══════════════════════════════════════════════════════════════
# SHARED UTILITIES
# ══════════════════════════════════════════════════════════════
class OrmBase(BaseModel):
    """Base for all response schemas. Enables ORM mode (from_orm)."""
    model_config = ConfigDict(from_attributes=True)


# ══════════════════════════════════════════════════════════════
# AUTH SCHEMAS
# ══════════════════════════════════════════════════════════════
class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserResponse(OrmBase):
    id: int
    email: str
    username: str
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    """Response from /auth/login — includes both token types."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int   # Access token TTL in seconds


class AccessTokenResponse(BaseModel):
    """Response from /auth/refresh — access token only."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    """Body for POST /auth/refresh."""
    refresh_token: str = Field(..., min_length=1)


class LogoutRequest(BaseModel):
    """Body for POST /auth/logout — revokes a specific refresh token."""
    refresh_token: str = Field(..., min_length=1)


# ══════════════════════════════════════════════════════════════
# MARKET DATA SCHEMAS
# ══════════════════════════════════════════════════════════════
class MarketDataCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    timestamp: datetime
    open: float = Field(..., gt=0)
    high: float = Field(..., gt=0)
    low: float = Field(..., gt=0)
    close: float = Field(..., gt=0)
    volume: float = Field(..., ge=0)

    @field_validator("symbol")
    @classmethod
    def symbol_uppercase(cls, v: str) -> str:
        return v.upper().strip()

    @model_validator(mode="after")
    def high_gte_low(self) -> "MarketDataCreate":
        if self.high < self.low:
            raise ValueError("high must be >= low")
        return self


class MarketDataResponse(OrmBase):
    id: int
    user_id: int
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    market: Optional[str]
    created_at: datetime


# ══════════════════════════════════════════════════════════════
# ANOMALY SCHEMAS
# ══════════════════════════════════════════════════════════════
class AnomalyDetectRequest(BaseModel):
    market_data_id: int = Field(..., gt=0)
    threshold: float = Field(default=0.7, ge=0.0, le=1.0)


class EvidenceSignalSchema(BaseModel):
    """A single explainability signal from the Evidence Generator."""
    name: str
    value: float
    threshold: float
    triggered: bool


class DetectionResultSchema(BaseModel):
    """Structured prediction from the ML pipeline boundary."""
    label: str
    confidence: float
    detector_score: float
    detector_agreement: float
    source: str
    evidence: List[EvidenceSignalSchema] = []


class AnomalyResponse(OrmBase):
    id: int
    market_data_id: int
    anomaly_score: float
    is_anomaly: bool
    isolation_forest_score: Optional[float]
    multi_pattern_max_score: Optional[float]
    pattern_scores: Optional[str]
    model_version: Optional[str]
    features: Optional[str]
    detected_at: datetime
    severity: str

    @computed_field
    @property
    def primary_signal(self) -> str:
        if self.pattern_scores:
            import json
            try:
                parsed = json.loads(self.pattern_scores)
                max_pattern = 'ANOMALY'
                max_val = 0.0
                for pat, val in parsed.items():
                    if val > max_val and val >= 0.5:
                        max_val = val
                        max_pattern = pat.upper().replace('_', ' ')
                return max_pattern
            except Exception:
                pass

        if self.anomaly_score >= 0.8:
            return "PUMP & DUMP"
        if self.anomaly_score >= 0.7:
            return "WASH TRADING"
        if self.anomaly_score >= 0.5:
            return "SPOOFING"
        return "NORMAL"


class AnomalyListResponse(AnomalyResponse):
    """Adds joined fields from MarketData and optional explainability signals."""
    symbol: str
    market_timestamp: datetime
    market: Optional[str] = None
    # Explainability fields — populated at read time from stored features.
    # Optional because older records may not have feature data.
    evidence: Optional[List[EvidenceSignalSchema]] = None
    detection_result: Optional[DetectionResultSchema] = None
    detector_agreement: Optional[float] = None
    weak_label_confidence: Optional[float] = None


class AnomalyPaginatedResponse(BaseModel):
    items: List[AnomalyListResponse]
    total: int
    limit: int
    offset: int


# ══════════════════════════════════════════════════════════════
# ALERT SCHEMAS
# ══════════════════════════════════════════════════════════════
class AlertCreate(BaseModel):
    anomaly_id: int = Field(..., gt=0)
    message: Optional[str] = Field(None, max_length=1000)


class AlertUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern=r"^(PENDING|ACTIVE|RESOLVED|DISMISSED)$")
    message: Optional[str] = Field(None, max_length=1000)


class AlertResponse(OrmBase):
    id: int
    anomaly_id: int
    user_id: int
    status: str
    message: Optional[str]
    created_at: datetime
    updated_at: datetime


# ══════════════════════════════════════════════════════════════
# WATCHLIST SCHEMAS  (Phase 2 — NEW)
# ══════════════════════════════════════════════════════════════
class WatchlistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class WatchlistUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class WatchlistSymbolAdd(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("symbol")
    @classmethod
    def symbol_uppercase(cls, v: str) -> str:
        return v.upper().strip()


class WatchlistSymbolResponse(OrmBase):
    id: int
    watchlist_id: int
    symbol: str
    notes: Optional[str]
    added_at: datetime


class WatchlistResponse(OrmBase):
    id: int
    user_id: int
    name: str
    description: Optional[str]
    symbols: List[WatchlistSymbolResponse] = []
    created_at: datetime
    updated_at: datetime


class WatchlistListResponse(OrmBase):
    """Lightweight list view — no symbol details."""
    id: int
    user_id: int
    name: str
    description: Optional[str]
    symbol_count: int = 0
    created_at: datetime
    updated_at: datetime


# ══════════════════════════════════════════════════════════════
# CASE MANAGEMENT SCHEMAS (Phases B2-B5 — NEW)
# ══════════════════════════════════════════════════════════════
class CaseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    anomaly_ids: List[int] = Field(..., min_length=1)


class CaseUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern=r"^(OPEN|IN_REVIEW|ESCALATED|DISMISSED|CLOSED)$")


class CaseAssign(BaseModel):
    assignee_user_id: int


class CaseLinkAnomalies(BaseModel):
    anomaly_ids: List[int] = Field(..., min_length=1)


class CaseResponse(OrmBase):
    id: int
    created_by_user_id: int
    assigned_to_user_id: Optional[int]
    title: str
    status: str
    anomaly_ids: List[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime]

    @model_validator(mode="before")
    @classmethod
    def populate_anomaly_ids(cls, data: any) -> any:
        if hasattr(data, "anomalies") and data.anomalies is not None:
            # Handle SQLAlchemy models
            data.anomaly_ids = [a.id for a in data.anomalies]
        elif isinstance(data, dict) and "anomalies" in data:
            # Handle dicts
            data["anomaly_ids"] = [a.id for a in data["anomalies"]]
        return data


class CasePaginatedResponse(BaseModel):
    items: List[CaseResponse]
    total: int
    limit: int
    offset: int


class CaseNoteCreate(BaseModel):
    body: str = Field(..., min_length=1)


class CaseNoteResponse(OrmBase):
    id: int
    case_id: int
    author_user_id: int
    body: str
    created_at: datetime


class CaseEventResponse(OrmBase):
    id: int
    case_id: int
    actor_user_id: Optional[int]
    event_type: str
    detail: Optional[str]
    created_at: datetime
