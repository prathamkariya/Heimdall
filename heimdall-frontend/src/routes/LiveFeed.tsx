import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/auth-context'
import { ConnectionStatus } from '../components/ConnectionStatus'
import type { LiveAlertEvent, EvidenceSignal } from '../lib/types'
import { isScoredAlert } from '../lib/types'

const MAX_EVENTS = 200
const BASE_URL = '/api/v1'

type ConnState = 'connecting' | 'live' | 'reconnecting'

export function LiveFeed() {
  const { getSseToken } = useAuth()
  const [events, setEvents] = useState<LiveAlertEvent[]>([])
  const [connState, setConnState] = useState<ConnState>('connecting')
  const [timeStr, setTimeStr] = useState('')
  const eventSourceRef = useRef<EventSource | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => {
      setTimeStr(new Date().toISOString().slice(11, 19) + ' UTC')
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [])

  const connect = useCallback(async () => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setConnState('connecting')

    try {
      const token = await getSseToken()
      const es = new EventSource(`${BASE_URL}/alerts/stream/live?token=${encodeURIComponent(token)}`)
      eventSourceRef.current = es

      es.onopen = () => {
        setConnState('live')
      }

      es.onmessage = (e) => {
        try {
          const event: LiveAlertEvent = JSON.parse(e.data)
          setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS))
        } catch {
          // Malformed SSE data — skip, don't crash
        }
      }

      es.onerror = () => {
        // Close the dead connection to prevent native auto-reconnect with a stale token
        es.close()
        setConnState('reconnecting')
        // Reconnect manually to fetch a fresh token
        setTimeout(() => connect(), 5000)
      }
    } catch (err) {
      console.error('Failed to acquire SSE token', err)
      setConnState('reconnecting')
      // Retry after a delay
      setTimeout(() => connect(), 5000)
    }
  }, [getSseToken])

  useEffect(() => {
    connect()
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [connect])

  return (
    <div className="flex h-full flex-col select-none">
      {/* Header bar */}
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-ink">Live Feed</h1>
          <ConnectionStatus state={connState} />
          {connState === 'live' && (
            <span className="font-mono text-[9px] text-up uppercase font-semibold bg-up/10 px-1.5 py-0.5 rounded border border-up/20 animate-pulse">
              Feed is active.
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] text-ink-faint">
          <span className="tabular">{timeStr}</span>
          <span className="border-l border-line h-3 pl-4">
            {events.length} event{events.length !== 1 && 's'}
          </span>
        </div>
      </header>

      {/* Column headers */}
      <div className="grid grid-cols-[120px_80px_80px_120px_80px_1fr] gap-x-4 border-b border-line bg-surface px-5 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        <span>Symbol</span>
        <span>Market</span>
        <span>Score</span>
        <span>Primary Signal</span>
        <span>Severity</span>
        <span>Time</span>
      </div>

      {/* Event rows */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-ink-faint font-mono text-[11px] gap-2">
            <p>Event stream initialized.</p>
            <p>Awaiting incoming market data.</p>
            <p className="text-[10px] text-ink-dim mt-2">Feed Status: {connState.toUpperCase()}</p>
          </div>
        ) : events.filter(isScoredAlert).length === 0 ? (
          <div className="flex h-12 items-center justify-center text-xs text-ink-faint font-mono border-b border-line/40 bg-surface/30">
            No anomalies requiring analyst review.
          </div>
        ) : null}

        {events.map((event, i) => {
          const scored = isScoredAlert(event)
          const primarySignal = getPrimarySignal(event)
          const evidence = event.evidence ?? event.detection_result?.evidence ?? []
          return (
            <EventRow
              key={`${event.symbol}-${event.timestamp_ms || event.timestamp}-${i}`}
              event={event}
              scored={scored}
              primarySignal={primarySignal}
              evidence={evidence}
              isNew={i === 0}
            />
          )
        })}
      </div>
    </div>
  )
}

function getPrimarySignal(event: LiveAlertEvent): string {
  if (!isScoredAlert(event)) return 'COVERAGE GAP'
  
  if (event.pattern_scores) {
    try {
      const parsed = typeof event.pattern_scores === 'string'
        ? JSON.parse(event.pattern_scores)
        : event.pattern_scores
      let maxPattern = 'ANOMALY'
      let maxVal = 0
      for (const [pat, val] of Object.entries(parsed)) {
        if ((val as number) > maxVal && (val as number) >= 0.5) {
          maxVal = val as number
          maxPattern = pat.toUpperCase().replace(/_/g, ' ')
        }
      }
      return maxPattern
    } catch {
      // Ignore
    }
  }

  const score = event.anomaly_score ?? 0
  if (score >= 0.8) return 'PUMP & DUMP'
  if (score >= 0.7) return 'WASH TRADING'
  if (score >= 0.5) return 'SPOOFING'
  return 'NORMAL'
}

function formatTimestamp(ts: string | number | undefined): string {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  } catch {
    return String(ts)
  }
}

function SeverityBadge({ severity }: { severity: string }) {
  const sev = severity.toUpperCase()
  const style =
    sev === 'CRITICAL'
      ? 'text-down bg-down/10 border-down/25 font-bold'
      : sev === 'HIGH'
        ? 'text-down bg-down/10 border-down/20'
        : sev === 'MEDIUM'
          ? 'text-accent bg-accent/10 border-accent/20'
          : 'text-ink-dim bg-raised border-line'
  return (
    <span className={`text-[9px] font-mono tracking-wider rounded px-1 py-0.5 border ${style}`}>
      {sev}
    </span>
  )
}

// ── EventRow ────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: LiveAlertEvent
  scored: boolean
  primarySignal: string
  evidence: EvidenceSignal[]
  isNew: boolean
}

function EventRow({ event, scored, primarySignal, evidence, isNew }: EventRowProps) {
  const [open, setOpen] = useState(false)
  const hasEvidence = evidence.length > 0

  return (
    <div className={`border-b border-line/40 font-mono text-[13px] transition-colors ${
      scored ? 'text-ink hover:bg-raised/40' : 'text-ink-faint italic hover:bg-raised/20'
    }`}>
      {/* Main row */}
      <div
        className={`grid grid-cols-[120px_80px_80px_120px_80px_1fr_16px] gap-x-4 px-5 py-1.5 ${
          isNew ? 'animate-row-flash' : ''
        } ${hasEvidence ? 'cursor-pointer' : ''}`}
        onClick={() => hasEvidence && setOpen(o => !o)}
      >
        <span className="truncate font-medium">{event.symbol}</span>
        <span className="text-ink-dim">{event.market}</span>

        {/* Score */}
        <span>
          {scored ? (
            <span className={
              (event.anomaly_score ?? 0) >= 0.8
                ? 'text-down font-medium'
                : (event.anomaly_score ?? 0) >= 0.5
                  ? 'text-accent'
                  : 'text-ink-dim'
            }>
              {event.anomaly_score?.toFixed(4)}
            </span>
          ) : (
            <span className="text-ink-faint text-[11px]">{event.confidence ?? '—'}</span>
          )}
        </span>

        {/* Primary signal */}
        <span>
          {scored ? (
            <span className={`text-[11px] rounded px-1.5 py-0.5 border ${
              primarySignal === 'PUMP & DUMP'
                ? 'bg-down/10 text-down border-down/20 font-medium'
                : primarySignal === 'WASH TRADING'
                  ? 'bg-accent/10 text-accent border-accent/20'
                  : 'bg-raised text-ink-dim border-line'
            }`}>
              {primarySignal}
            </span>
          ) : (
            <span className="text-ink-faint text-[11px] italic">{primarySignal}</span>
          )}
        </span>

        {/* Severity */}
        <span>
          {scored && event.severity
            ? <SeverityBadge severity={event.severity} />
            : <span className="text-ink-faint text-[11px]">—</span>}
        </span>

        {/* Timestamp */}
        <span className="text-ink-dim tabular">
          {formatTimestamp(event.timestamp_ms || event.timestamp)}
        </span>

        {/* Expand toggle */}
        <span className="text-ink-faint text-[10px] self-center">
          {hasEvidence ? (open ? '▲' : '▼') : ''}
        </span>
      </div>

      {/* Evidence panel */}
      {open && hasEvidence && (
        <div className="px-5 pb-2 pt-1 grid grid-cols-[1fr_1fr_1fr_60px] gap-x-4 gap-y-1 bg-surface/60 border-t border-line/20">
          <span className="text-[9px] uppercase tracking-wider text-ink-faint font-semibold">Signal</span>
          <span className="text-[9px] uppercase tracking-wider text-ink-faint font-semibold">Observed</span>
          <span className="text-[9px] uppercase tracking-wider text-ink-faint font-semibold">Threshold</span>
          <span className="text-[9px] uppercase tracking-wider text-ink-faint font-semibold">Status</span>
          {evidence.map((sig) => (
            <>
              <span className="text-[11px] text-ink-dim font-mono">
                {sig.name.replace(/_/g, ' ')}
              </span>
              <span className="text-[11px] tabular">{sig.value.toFixed(4)}</span>
              <span className="text-[11px] tabular text-ink-dim">{sig.threshold.toFixed(4)}</span>
              <span className={`text-[10px] font-semibold ${
                sig.triggered ? 'text-down' : 'text-up'
              }`}>
                {sig.triggered ? '✓ FIRED' : '– OK'}
              </span>
            </>
          ))}
        </div>
      )}
    </div>
  )
}
