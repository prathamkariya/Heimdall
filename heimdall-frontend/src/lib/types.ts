/**
 * API types, kept deliberately honest to the real backend rather than an
 * idealized one. Two things in particular are true of the actual system
 * and encoded here on purpose:
 *
 * 1. A persisted `Anomaly` row and a live-streamed scoring event are two
 *    different shapes, not one type with optional fields. The persisted
 *    row has a real `is_anomaly` boolean; the live stream event does not
 *    — it has to be inferred from `anomaly_score !== null` and the
 *    absence of a sentinel `confidence` string. Don't merge these into
 *    one interface — it hides a real distinction the backend actually
 *    has, and the day they diverge further this will silently lie.
 *
 * 2. `pattern_scores` and `features` are stored, and therefore served,
 *    as raw JSON strings, not nested objects. They need `JSON.parse`
 *    on the way in, not a hopeful `as` cast.
 */

/** The 4 real sentinel values the backend can put in a live event's
 *  `confidence` field. There is no 5th value and no generic fallback —
 *  treat an unrecognized string here as a contract change, not a typo. */
type ConfidenceSentinel =
  | 'model_unavailable'
  | 'no_model_high_confidence'
  | 'baseline_unavailable'
  | 'no_baseline_high_confidence'

type Market = 'CRYPTO' | 'US_EQUITY'

/** A row from `GET /anomalies` — persisted history. */
export interface AnomalyListItem {
  id: number
  symbol: string
  market: Market
  market_timestamp: string
  anomaly_score: number
  is_anomaly: boolean
  isolation_forest_score: number | null
  multi_pattern_max_score: number | null
  /** Raw JSON string. Parse before use: JSON.parse(pattern_scores). */
  pattern_scores: string | null
  model_version: string | null
  primary_signal?: string
  detected_at: string
  // plan5.md — explainability injected at read time from stored features
  evidence?: EvidenceSignal[] | null
  detection_result?: DetectionResult | null
  detector_agreement?: number | null
  weak_label_confidence?: number | null
  severity?: string
}

export interface AnomalyPaginatedResponse {
  items: AnomalyListItem[]
  total: number
  limit: number
  offset: number
}

/** A single explainability signal from the Evidence Generator. */
export interface EvidenceSignal {
  name: string
  value: number
  threshold: number
  triggered: boolean
  z_score?: number
}

/** Structured prediction from the ML pipeline boundary. */
interface DetectionResult {
  label: string
  confidence: number
  detector_score: number
  detector_agreement: number
  source: string
  evidence: EvidenceSignal[]
}

/** An event off the live SSE stream (`GET /alerts/stream/live`).
 *  Deliberately NOT the same shape as AnomalyListItem — see file header. */
export interface LiveAlertEvent {
  symbol: string
  market: Market
  price?: number
  volume?: number
  anomaly_score: number | null
  low_confidence: boolean
  /** Present only on a sentinel (degraded-coverage) event. */
  confidence?: ConfidenceSentinel
  timestamp?: string
  timestamp_ms?: number
  pattern_scores?: Record<string, number> | string
  severity?: string
  anomaly_id?: number
  primary_signal?: string
  // plan2.md fields — present when models are trained and scoring succeeds
  detector_agreement?: number
  weak_label_confidence?: number
  evidence?: EvidenceSignal[] | null
  detection_result?: DetectionResult | null
}

/** True only for a genuinely scored alert, not a coverage-gap notice.
 *  There is no `is_anomaly` field on the wire for live events — this is
 *  the actual inference the backend expects the client to make. */
export function isScoredAlert(e: LiveAlertEvent): boolean {
  return e.anomaly_score !== null && e.confidence === undefined
}

export interface CaseEvent {
  id: number
  case_id: number
  actor_user_id: number | null
  event_type: string
  detail: string | null
  created_at: string
}

export interface CaseNote {
  id: number
  case_id: number
  author_user_id: number
  body: string
  created_at: string
}

export interface Case {
  id: number
  created_by_user_id: number
  assigned_to_user_id: number | null
  title: string
  status: string
  anomaly_ids: number[]
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface CasePaginatedResponse {
  items: Case[]
  total: number
  limit: number
  offset: number
}

export interface Analyst {
  id: number
  email: string
  username: string
  role: string
}

export interface MarketModelStatus {
  loaded: boolean
  has_isolation_forest: boolean
  has_multi_pattern: boolean
  patterns: string[]
  // has_lof removed: LOF model was loaded but never wired into scoring (FIX-06).
  baseline_symbols_count: number
  feature_columns: string[]
  min_raw_rows_required: number
}

export interface ModelTelemetryResponse {
  status: 'healthy' | 'degraded' | 'offline'
  markets: Record<Market, MarketModelStatus>
}
