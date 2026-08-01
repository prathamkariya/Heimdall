import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'
import { apiFetch } from '../lib/api'
import type { AnomalyListItem, EvidenceSignal } from '../lib/types'
import { SignalStrength } from './SignalStrength'
import { EvidenceBar } from './EvidenceBar'
import { CollapsibleSection } from './CollapsibleSection'
import { formatDate } from '../lib/utils'
import { useSettings } from '../lib/SettingsContext'

interface AnomalyDetailProps {
  anomaly: AnomalyListItem
  cases: any[]
  onClose: () => void
  onCaseUpdated: () => void
  onSelectAnomaly?: (anomaly: AnomalyListItem) => void
}

interface AnomalyChartProps {
  symbol: string
  marketTimestamp: string
}

export function AnomalyChart({ symbol, marketTimestamp }: AnomalyChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let chart: any = null

    async function loadChartData() {
      setLoading(true)
      setError(null)
      try {
        const res = await apiFetch(`/market-data?symbol=${encodeURIComponent(symbol)}&limit=100`) as any[]
        if (!active) return

        if (!res || res.length === 0) {
          setError('No historical data')
          setLoading(false)
          return
        }

        // Lightweight charts requires ascending order
        const chartData = res
          .map((d) => ({
            time: Math.floor(new Date(d.timestamp).getTime() / 1000) as any,
            open: parseFloat(d.open),
            high: parseFloat(d.high),
            low: parseFloat(d.low),
            close: parseFloat(d.close),
            value: parseFloat(d.volume || 0),
            color: parseFloat(d.close) >= parseFloat(d.open) ? '#4fbf7a40' : '#e8604c40'
          }))
          .sort((a, b) => a.time - b.time)

        if (chartContainerRef.current) {
          chart = createChart(chartContainerRef.current, {
            layout: {
              background: { type: 'solid' as any, color: '#12161a' }, // surface
              textColor: '#7c8790', // ink-dim
              fontFamily: 'IBM Plex Mono, monospace',
            },
            grid: {
              vertLines: { color: '#232a31' }, // line
              horzLines: { color: '#232a31' }, // line
            },
            rightPriceScale: {
              scaleMargins: {
                top: 0.1,
                bottom: 0.25, // leave space for volume
              },
              borderColor: '#232a31',
            },
            width: chartContainerRef.current.clientWidth || 340,
            height: 185,
            timeScale: {
              borderColor: '#232a31',
              timeVisible: true,
              secondsVisible: false,
            },
          })

          const candleSeries = chart.addCandlestickSeries({
            upColor: '#4fbf7a', // up
            downColor: '#e8604c', // down
            borderVisible: false,
            wickUpColor: '#4fbf7a',
            wickDownColor: '#e8604c',
          })
          candleSeries.setData(chartData)

          const volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: '', // overlay
          })
          volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          })
          volumeSeries.setData(chartData)

          // Find closest timestamp to place marker
          const targetTime = Math.floor(new Date(marketTimestamp).getTime() / 1000)
          const closest = chartData.reduce((prev, curr) => {
            return Math.abs(curr.time - targetTime) < Math.abs(prev.time - targetTime) ? curr : prev
          })

          candleSeries.setMarkers([
            {
              time: closest.time,
              position: 'aboveBar',
              color: '#d9a441', // amber accent
              shape: 'pin',
              text: 'ALERT',
            },
          ])

          chart.timeScale().fitContent()
        }
        setLoading(false)
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'Failed to load chart')
          setLoading(false)
        }
      }
    }

    loadChartData()

    // Handle resize
    const handleResize = () => {
      if (chart && chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      active = false
      window.removeEventListener('resize', handleResize)
      if (chart) {
        chart.remove()
      }
    }
  }, [symbol, marketTimestamp])

  return (
    <div className="relative border border-line bg-surface p-2 rounded">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        Price History ({symbol})
      </div>
      {loading && (
        <div className="flex h-[180px] items-center justify-center font-mono text-[11px] text-ink-faint">
          Loading price chart…
        </div>
      )}
      {error && (
        <div className="relative flex h-[180px] w-full flex-col items-center justify-center overflow-hidden">
          {/* Faint placeholder chart structure */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none flex items-end justify-between px-2 pb-4">
             {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="w-[14px] bg-ink" style={{ height: `${20 + Math.random() * 60}%` }} />
             ))}
          </div>
          <span className="font-mono text-[11px] text-ink-faint z-10">{error}</span>
        </div>
      )}
      <div
        ref={chartContainerRef}
        className={loading || error ? 'invisible h-0' : 'visible w-full'}
      />
    </div>
  )
}

/** Severity badge — color coded per Phase 0 tokens */
function SeverityBadge({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    CRITICAL: 'bg-down/20 text-down border-down/30',
    HIGH: 'bg-down-dim/30 text-down border-down-dim/40',
    MEDIUM: 'bg-accent-dim/30 text-accent border-accent-dim/40',
    LOW: 'bg-raised text-ink-dim border-line',
  }
  const classes = colorMap[severity] ?? colorMap.LOW

  return (
    <span className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${classes}`}>
      {severity}
    </span>
  )
}

/** Parse pattern_scores from the raw JSON string the backend stores. */
function parsePatternScores(raw: string | null): Record<string, number> {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function AnomalyDetail({ anomaly, cases, onClose, onCaseUpdated, onSelectAnomaly }: AnomalyDetailProps) {
  const patterns = parsePatternScores(anomaly.pattern_scores)
  const severity = anomaly.severity
  const [actionLoading, setActionLoading] = useState(false)
  const { timezone } = useSettings()

  // Find if this anomaly is associated with any case
  const associatedCase = cases.find(c => c.anomaly_ids && c.anomaly_ids.includes(anomaly.id))

  const handleCreateCase = async () => {
    setActionLoading(true)
    try {
      await apiFetch('/cases', {
        method: 'POST',
        body: JSON.stringify({
          title: `Investigation for ${anomaly.symbol} Anomaly #${anomaly.id}`,
          anomaly_ids: [anomaly.id]
        })
      })
      onCaseUpdated()
    } catch (err) {
      console.error('Failed to create case', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateCaseStatus = async (caseId: number, nextStatus: string) => {
    setActionLoading(true)
    try {
      await apiFetch(`/cases/${caseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      })
      onCaseUpdated()
    } catch (err) {
      console.error('Failed to update case status', err)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-line bg-surface select-none animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          {associatedCase && <span className="font-mono text-[11px] font-semibold text-accent pr-2 border-r border-line">CASE-{associatedCase.id}</span>}
          <span className="font-mono text-[13px] font-medium text-ink">{anomaly.symbol}</span>
          {severity && <SeverityBadge severity={severity} />}
          <span className="font-mono text-[10px] text-ink-faint ml-1">{anomaly.market}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-ink-faint transition-colors hover:bg-raised hover:text-ink cursor-pointer"
          aria-label="Close detail panel"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        <AnomalyChart symbol={anomaly.symbol} marketTimestamp={anomaly.market_timestamp} />

        {/* Summary metrics */}
        <CollapsibleSection title="Detection Summary" storageKey="heimdall_col_detection_summary">
          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 mt-2">
            <dt className="font-mono text-[10px] text-ink-faint truncate">Anomaly Confidence</dt>
            <dd className="font-mono text-[11px] tabular">
              <SignalStrength 
                score={anomaly.anomaly_score} 
                size="sm"
              />
            </dd>
            <MetricRow label="Is Anomaly" value={anomaly.is_anomaly ? 'YES' : 'NO'} />
            <MetricRow
              label="Isolation Forest"
              value={anomaly.isolation_forest_score?.toFixed(4) ?? '—'}
            />
            <MetricRow
              label="Multi-Pattern Max"
              value={anomaly.multi_pattern_max_score?.toFixed(4) ?? '—'}
            />
            <MetricRow label="Market" value={anomaly.market} />
            <MetricRow label="Model Version" value={anomaly.model_version ?? '—'} />
            {anomaly.detector_agreement != null && (
              <MetricRow
                label="Detector Agreement"
                value={anomaly.detector_agreement === 1.0 ? 'BOTH AGREE' : 'PARTIAL'}
              />
            )}
            {anomaly.weak_label_confidence != null && (
              <MetricRow
                label="Attribution Confidence"
                value={`${(anomaly.weak_label_confidence * 100).toFixed(1)}%`}
              />
            )}
          </dl>
        </CollapsibleSection>

        {/* Pattern breakdown — the "not a black box" signal */}
        {Object.keys(patterns).length > 0 && (
          <CollapsibleSection title="Pattern Scores" storageKey="heimdall_col_pattern_scores">
            <div className="mt-2 space-y-2">
              {Object.entries(patterns)
                .sort(([, a], [, b]) => b - a)
                .map(([pattern, score]) => (
                  <div key={pattern} className="flex items-center gap-3">
                    <span className="w-32 truncate font-mono text-[11px] text-ink-dim">
                      {pattern}
                    </span>
                    <div className="flex-1 text-[11px] font-mono tracking-[0.1em] text-ink-faint select-none">
                      {Array.from({ length: 8 }).map((_, i) => {
                        const filled = i < Math.round(score * 8);
                        const colorClass = score >= 0.8 ? 'text-down' : score >= 0.5 ? 'text-accent' : 'text-ink-dim';
                        return <span key={i} className={filled ? colorClass : 'opacity-30'}>{filled ? '■' : '□'}</span>
                      })}
                    </div>
                    <span className={`w-14 text-right font-mono text-[11px] tabular ${score >= 0.8 ? 'text-down font-bold' : score >= 0.5 ? 'text-accent font-medium' : 'text-ink-dim'}`}>
                      {(score * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </CollapsibleSection>
        )}


        {anomaly.evidence && anomaly.evidence.length > 0 && (
          <CollapsibleSection title="Evidence Signals" storageKey="heimdall_col_evidence_signals">
            <EvidencePanel signals={anomaly.evidence} />
          </CollapsibleSection>
        )}

        {/* Timestamps */}
        <CollapsibleSection title="Timestamps" storageKey="heimdall_col_timestamps">
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between font-mono text-[10px] gap-2">
              <dt className="text-ink-faint truncate">Market</dt>
              <dd className="text-ink-dim tabular truncate">{formatDt(anomaly.market_timestamp, timezone)}</dd>
            </div>
            <div className="flex justify-between font-mono text-[10px] gap-2">
              <dt className="text-ink-faint truncate">Detected</dt>
              <dd className="text-ink-dim tabular truncate">{formatDt(anomaly.detected_at, timezone)}</dd>
            </div>
          </dl>
        </CollapsibleSection>

        {/* Related Alerts */}
        <CollapsibleSection title={`Related Alerts (${anomaly.symbol})`} storageKey="heimdall_col_related_alerts">
          <RelatedAlerts currentId={anomaly.id} symbol={anomaly.symbol} onSelectAnomaly={onSelectAnomaly} />
        </CollapsibleSection>

        {/* Incident Management Workflow (Phases B2-B5) */}
        <CollapsibleSection title="Incident Workflow" storageKey="heimdall_col_incident_workflow" className="border-t border-line pt-4">
          {associatedCase ? (
            <div className="mt-2 space-y-3 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-ink-faint">CASE ID</span>
                <span className="text-accent font-medium">CASE-{associatedCase.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">TITLE</span>
                <span className="text-ink-dim truncate max-w-[200px]" title={associatedCase.title}>
                  {associatedCase.title}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">STATUS</span>
                <span className={`font-semibold rounded px-1.5 py-0.5 border ${
                  associatedCase.status === 'OPEN' ? 'text-down bg-down/10 border-down/20' :
                  associatedCase.status === 'IN_REVIEW' ? 'text-accent bg-accent/10 border-accent/20' :
                  associatedCase.status === 'ESCALATED' ? 'text-down font-bold bg-down/20 border-down/30 animate-pulse' :
                  'text-ink-dim bg-raised border-line'
                }`}>
                  {associatedCase.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2">
                {associatedCase.status === 'OPEN' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateCaseStatus(associatedCase.id, 'IN_REVIEW')}
                    className="rounded bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    START REVIEW
                  </button>
                )}
                {associatedCase.status === 'IN_REVIEW' && (
                  <>
                    <button
                      disabled={actionLoading}
                      onClick={() => handleUpdateCaseStatus(associatedCase.id, 'ESCALATED')}
                      className="rounded bg-down/10 border border-down/30 text-down hover:bg-down/20 px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      ESCALATE
                    </button>
                    <button
                      disabled={actionLoading}
                      onClick={() => handleUpdateCaseStatus(associatedCase.id, 'CLOSED')}
                      className="rounded bg-surface border border-line hover:bg-raised text-ink-dim px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      RESOLVE/CLOSE
                    </button>
                  </>
                )}
                {(associatedCase.status === 'DISMISSED' || associatedCase.status === 'CLOSED' || associatedCase.status === 'ESCALATED') && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateCaseStatus(associatedCase.id, 'OPEN')}
                    className="rounded bg-surface border border-line hover:bg-raised text-ink-dim px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    REOPEN CASE
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 font-mono text-[11px] text-ink-faint flex flex-col gap-2">
              <p>No active case is investigating this anomaly.</p>
              <button
                disabled={actionLoading}
                onClick={handleCreateCase}
                className="w-full rounded bg-accent border border-accent text-void hover:bg-accent-dim hover:border-accent-dim px-4 py-2 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
              >
                START INVESTIGATION
              </button>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}

/* ── Evidence panel ────────────────────────────────────────────────────── */

function EvidencePanel({ signals }: { signals: EvidenceSignal[] }) {
  return (
    <div className="mt-2 space-y-3">
      {signals.map((sig, i) => (
        <EvidenceBar 
          key={i}
          name={sig.name}
          observed={sig.value}
          threshold={sig.threshold}
          triggered={sig.triggered}
        />
      ))}
    </div>
  )
}

/* ── Related Alerts panel ──────────────────────────────────────────────── */

function RelatedAlerts({ currentId, symbol, onSelectAnomaly }: { currentId: number; symbol: string; onSelectAnomaly?: (anomaly: AnomalyListItem) => void }) {
  const { timezone } = useSettings()
  const [alerts, setAlerts] = useState<AnomalyListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function fetchRelated() {
      try {
        const res = await apiFetch(`/anomalies?symbol=${encodeURIComponent(symbol)}&limit=6`) as any
        if (active) {
          // Filter out the current one
          const related = (res.items || []).filter((a: AnomalyListItem) => a.id !== currentId).slice(0, 5)
          setAlerts(related)
        }
      } catch (err) {
        console.error('Failed to fetch related alerts', err)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchRelated()
    return () => { active = false }
  }, [symbol, currentId])

  if (loading) {
    return <div className="mt-2 text-ink-faint font-mono text-[10px]">Finding related alerts...</div>
  }

  if (alerts.length === 0) {
    return <div className="mt-2 text-ink-faint font-mono text-[10px]">No related alerts found for {symbol}.</div>
  }

  return (
    <div className="mt-2 space-y-1.5">
      {alerts.map((a) => (
        <div 
          key={a.id} 
          onClick={() => onSelectAnomaly?.(a)}
          className="flex items-center justify-between border border-line bg-surface/50 rounded px-3 py-1.5 font-mono text-[11px] hover:bg-raised/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-ink-faint">#{a.id}</span>
            <span className="text-ink-dim truncate max-w-[150px]">{a.primary_signal || 'NORMAL'}</span>
          </div>
          <span className="text-ink-faint tabular text-[10px]">{formatDt(a.detected_at, timezone)}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Tiny helpers ──────────────────────────────────────────────── */



function MetricRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <>
      <dt className="font-mono text-[10px] text-ink-faint truncate">{label}</dt>
      <dd className={`font-mono text-[11px] tabular truncate ${highlight ? 'text-accent' : 'text-ink-dim'}`}>
        {value}
      </dd>
    </>
  )
}

function formatDt(ts: string, timezone: 'local' | 'utc'): string {
  return formatDate(ts, timezone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
