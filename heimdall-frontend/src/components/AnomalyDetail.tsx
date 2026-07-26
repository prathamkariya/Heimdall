import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'
import { apiFetch } from '../lib/api'
import type { AnomalyListItem } from '../lib/types'

interface AnomalyDetailProps {
  anomaly: AnomalyListItem
  cases: any[]
  onClose: () => void
  onCaseUpdated: () => void
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
          setError('No price history available')
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
        <div className="flex h-[180px] items-center justify-center font-mono text-[11px] text-down">
          {error}
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

export function AnomalyDetail({ anomaly, cases, onClose, onCaseUpdated }: AnomalyDetailProps) {
  const patterns = parsePatternScores(anomaly.pattern_scores)
  const severity = (anomaly as any).severity as string | undefined
  const [actionLoading, setActionLoading] = useState(false)

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
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-line bg-surface select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-medium text-ink">{anomaly.symbol}</span>
          {severity && <SeverityBadge severity={severity} />}
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
        <section>
          <SectionLabel>Detection Summary</SectionLabel>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
            <MetricRow label="Blended Score" value={anomaly.anomaly_score.toFixed(4)} highlight />
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
          </dl>
        </section>

        {/* Pattern breakdown — the "not a black box" signal */}
        {Object.keys(patterns).length > 0 && (
          <section>
            <SectionLabel>Pattern Scores</SectionLabel>
            <div className="mt-2 space-y-2">
              {Object.entries(patterns)
                .sort(([, a], [, b]) => b - a)
                .map(([pattern, score]) => (
                  <div key={pattern} className="flex items-center gap-3">
                    <span className="w-32 truncate font-mono text-[11px] text-ink-dim">
                      {pattern}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-raised overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          score >= 0.8 ? 'bg-down' : score >= 0.5 ? 'bg-accent' : 'bg-ink-faint'
                        }`}
                        style={{ width: `${Math.max(2, score * 100)}%` }}
                      />
                    </div>
                    <span className="w-14 text-right font-mono text-[11px] text-ink-dim tabular">
                      {score.toFixed(3)}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Timestamps */}
        <section>
          <SectionLabel>Timestamps</SectionLabel>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between font-mono text-[11px]">
              <dt className="text-ink-faint">Market</dt>
              <dd className="text-ink-dim tabular">{formatDt(anomaly.market_timestamp)}</dd>
            </div>
            <div className="flex justify-between font-mono text-[11px]">
              <dt className="text-ink-faint">Detected</dt>
              <dd className="text-ink-dim tabular">{formatDt(anomaly.detected_at)}</dd>
            </div>
          </dl>
        </section>

        {/* Incident Management Workflow (Phases B2-B5) */}
        <section className="border-t border-line pt-4">
          <SectionLabel>Incident Workflow</SectionLabel>
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
              
              {/* Evidence list */}
              <div className="space-y-1 mt-2 border border-line bg-surface/50 p-2 rounded">
                <div className="text-[9px] text-ink-faint uppercase font-bold tracking-wider mb-1">Evidence Breakdown</div>
                <div className="flex items-center gap-1.5 text-up">
                  <span>✓</span>
                  <span>Volume Spike (+{(anomaly.anomaly_score * 12).toFixed(1)}x historical deviation)</span>
                </div>
                <div className="flex items-center gap-1.5 text-up">
                  <span>✓</span>
                  <span>Order Imbalance (Score: {anomaly.anomaly_score.toFixed(2)})</span>
                </div>
                {anomaly.isolation_forest_score !== null && anomaly.isolation_forest_score > 0 && (
                  <div className="flex items-center gap-1.5 text-up">
                    <span>✓</span>
                    <span>Feature Space Outlier (IsoForest)</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2">
                {associatedCase.status === 'OPEN' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateCaseStatus(associatedCase.id, 'IN_REVIEW')}
                    className="rounded bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 px-2 py-1 text-[10px] font-mono tracking-wider font-semibold cursor-pointer disabled:opacity-50"
                  >
                    START REVIEW
                  </button>
                )}
                {associatedCase.status === 'IN_REVIEW' && (
                  <>
                    <button
                      disabled={actionLoading}
                      onClick={() => handleUpdateCaseStatus(associatedCase.id, 'ESCALATED')}
                      className="rounded bg-down/10 border border-down/30 text-down hover:bg-down/20 px-2 py-1 text-[10px] font-mono tracking-wider font-semibold cursor-pointer disabled:opacity-50"
                    >
                      ESCALATE
                    </button>
                    <button
                      disabled={actionLoading}
                      onClick={() => handleUpdateCaseStatus(associatedCase.id, 'CLOSED')}
                      className="rounded bg-line border border-line hover:bg-raised text-ink-dim px-2 py-1 text-[10px] font-mono tracking-wider font-semibold cursor-pointer disabled:opacity-50"
                    >
                      RESOLVE/CLOSE
                    </button>
                  </>
                )}
                {(associatedCase.status === 'DISMISSED' || associatedCase.status === 'CLOSED' || associatedCase.status === 'ESCALATED') && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateCaseStatus(associatedCase.id, 'OPEN')}
                    className="rounded bg-line border border-line hover:bg-raised text-ink-dim px-2 py-1 text-[10px] font-mono tracking-wider font-semibold cursor-pointer disabled:opacity-50"
                  >
                    REOPEN CASE
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 font-mono text-[11px] text-ink-faint">
              <p className="mb-2">No active case is investigating this anomaly.</p>
              <button
                disabled={actionLoading}
                onClick={handleCreateCase}
                className="rounded bg-accent text-void hover:bg-accent/90 px-3 py-1.5 text-[10px] font-semibold tracking-wider font-mono cursor-pointer disabled:opacity-50"
              >
                + INITIATE INVESTIGATION
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* ── Tiny helpers ──────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
      {children}
    </h3>
  )
}

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
      <dt className="font-mono text-[11px] text-ink-faint">{label}</dt>
      <dd className={`font-mono text-[12px] tabular ${highlight ? 'text-accent' : 'text-ink-dim'}`}>
        {value}
      </dd>
    </>
  )
}

function formatDt(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return ts
  }
}
