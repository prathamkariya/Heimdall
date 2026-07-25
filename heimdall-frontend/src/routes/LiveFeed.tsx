import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/auth-context'
import { ConnectionStatus } from '../components/ConnectionStatus'
import type { LiveAlertEvent } from '../lib/types'
import { isScoredAlert } from '../lib/types'

const MAX_EVENTS = 200
const BASE_URL = '/api/v1'

type ConnState = 'connecting' | 'live' | 'reconnecting'

export function LiveFeed() {
  const { getSseToken } = useAuth()
  const [events, setEvents] = useState<LiveAlertEvent[]>([])
  const [connState, setConnState] = useState<ConnState>('connecting')
  const eventSourceRef = useRef<EventSource | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
        // EventSource auto-reconnects, but the UI must reflect this
        setConnState('reconnecting')
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
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-ink">Live Feed</h1>
          <ConnectionStatus state={connState} />
        </div>
        <div className="font-mono text-[11px] text-ink-faint">
          {events.length} event{events.length !== 1 && 's'}
        </div>
      </header>

      {/* Column headers */}
      <div className="grid grid-cols-[120px_90px_100px_1fr] gap-x-4 border-b border-line bg-surface px-5 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        <span>Symbol</span>
        <span>Market</span>
        <span>Score</span>
        <span>Time</span>
      </div>

      {/* Event rows */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {events.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-ink-faint">
            {connState === 'connecting' ? 'Connecting to live stream…' : 'Waiting for events…'}
          </div>
        )}

        {events.map((event, i) => {
          const scored = isScoredAlert(event)
          return (
            <div
              key={`${event.symbol}-${event.timestamp}-${i}`}
              className={`grid grid-cols-[120px_90px_100px_1fr] gap-x-4 border-b border-line/40 px-5 py-1.5 font-mono text-[13px] transition-colors ${
                scored
                  ? 'text-ink hover:bg-raised/40'
                  : 'text-ink-faint italic hover:bg-raised/20'
              }`}
            >
              {/* Symbol */}
              <span className="truncate font-medium">
                {event.symbol}
              </span>

              {/* Market */}
              <span className="text-ink-dim">
                {event.market}
              </span>

              {/* Score */}
              <span>
                {scored ? (
                  <span className={
                    (event.anomaly_score ?? 0) >= 0.8
                      ? 'text-down'
                      : (event.anomaly_score ?? 0) >= 0.5
                        ? 'text-accent'
                        : 'text-ink-dim'
                  }>
                    {event.anomaly_score?.toFixed(4)}
                  </span>
                ) : (
                  <span className="text-ink-faint text-[11px]">
                    {event.confidence ?? '—'}
                  </span>
                )}
              </span>

              {/* Timestamp */}
              <span className="text-ink-dim tabular">
                {formatTimestamp(event.timestamp)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  } catch {
    return ts
  }
}
