import { useState, useEffect, useRef } from 'react'
import { useKeyboardNav } from '../lib/useKeyboardNav'
import { ConnectionStatus } from '../components/ConnectionStatus'
import type { LiveAlertEvent } from '../lib/types'
import { isScoredAlert } from '../lib/types'
import { SignalStrength } from '../components/SignalStrength'
import { EvidenceBar } from '../components/EvidenceBar'
import { CorrelationMatrix } from '../components/CorrelationMatrix'
import { useMarketDataStream } from '../lib/useMarketDataStream'
import { LiveEventRow, SeverityBadge } from '../components/LiveEventRow'

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

export function LiveFeed() {
  const [selectedEvent, setSelectedEvent] = useState<LiveAlertEvent | null>(null)
  const [timeStr, setTimeStr] = useState('')
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem('heimdall_demo_mode') === 'true')
  const [showCorrelation, setShowCorrelation] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Use our new encapsulated hook
  const { events, connState } = useMarketDataStream(isDemoMode)

  useEffect(() => {
    const update = () => {
      setTimeStr(new Date().toLocaleTimeString(undefined, { hour12: false }))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const handleDemoChange = () => {
      setIsDemoMode(localStorage.getItem('heimdall_demo_mode') === 'true')
    }
    window.addEventListener('demo_mode_change', handleDemoChange)
    return () => window.removeEventListener('demo_mode_change', handleDemoChange)
  }, [])

  const { focusedIndex } = useKeyboardNav({
    itemCount: events.length,
    onSelect: (index) => setSelectedEvent(events[index]),
    onClose: () => setSelectedEvent(null),
    isActive: true
  })

  return (
    <div className="flex h-full flex-col select-none overflow-hidden">
      {/* Header bar */}
      <header className="flex items-center justify-between border-b border-line px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-ink">Live Feed</h1>
          {isDemoMode && (
            <span className="font-mono text-[9px] text-accent uppercase font-semibold bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">
              DEMO MODE
            </span>
          )}
          <ConnectionStatus state={connState} />
          {connState === 'live' && !isDemoMode && (
            <span className="font-mono text-[9px] text-up uppercase font-semibold bg-up/10 px-1.5 py-0.5 rounded border border-up/20 animate-pulse">
              Feed is active.
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] text-ink-faint">
          <button
            onClick={() => setShowCorrelation(p => !p)}
            className={`font-mono text-[10px] px-2.5 py-1 rounded border transition-fast cursor-pointer ${
              showCorrelation
                ? 'bg-accent/15 border-accent/30 text-accent'
                : 'bg-surface border-line text-ink-faint hover:text-ink hover:border-line/80'
            }`}
          >
            Cross-Asset Matrix
          </button>
          <span className="tabular">{timeStr}</span>
          <span className="border-l border-line h-3 pl-4">
            {events.length} event{events.length !== 1 && 's'}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Table Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Column headers */}
          <div className="grid grid-cols-[100px_70px_80px_80px_60px_110px_70px_1fr] gap-x-4 border-b border-line bg-surface px-5 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint flex-shrink-0">
            <span>Symbol</span>
            <span>Market</span>
            <span>Price</span>
            <span>Volume</span>
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
              const primarySignal = !scored ? 'COVERAGE GAP' : (event.primary_signal || 'NORMAL')
              
              return (
                <LiveEventRow
                  key={`${event.symbol}-${event.timestamp_ms || event.timestamp}-${i}`}
                  event={event}
                  scored={scored}
                  primarySignal={primarySignal}
                  isNew={i === 0}
                  isSelected={selectedEvent === event}
                  isFocused={i === focusedIndex}
                  onClick={() => setSelectedEvent(event)}
                />
              )
            })}
          </div>
        </div>

        {/* Right Details Drawer */}
        {selectedEvent && (
          <div className="w-96 border-l border-line bg-surface flex flex-col flex-shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-line">
              <h2 className="text-sm font-medium text-ink truncate">
                Anomaly: {selectedEvent.symbol}
              </h2>
              <button 
                className="text-ink-faint hover:text-ink transition-colors"
                onClick={() => setSelectedEvent(null)}
              >
                <span className="text-lg">×</span>
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-6">
              {/* Quick Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint font-mono">Anomaly Confidence</span>
                  <div className="mt-1">
                    <SignalStrength 
                      score={selectedEvent.anomaly_score ?? 0} 
                      label={selectedEvent.anomaly_score && selectedEvent.anomaly_score >= 0.75 ? "High Confidence" : "Standard"} 
                      size="md"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint font-mono">Severity</span>
                  <div>
                    {selectedEvent.severity 
                      ? <SeverityBadge severity={selectedEvent.severity} /> 
                      : <span className="text-ink-faint text-[11px] font-mono">—</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint font-mono">Primary Signal</span>
                  <span className="text-xs font-medium text-ink">{selectedEvent.primary_signal || 'NORMAL'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint font-mono">Time</span>
                  <span className="text-[11px] font-mono text-ink-dim tabular-nums">
                    {formatTimestamp(selectedEvent.timestamp_ms || selectedEvent.timestamp)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button className="w-full bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 py-2 rounded text-xs font-medium transition-colors">
                  Create Investigation Case
                </button>
                <button className="w-full bg-surface hover:bg-raised text-ink-dim border border-line py-2 rounded text-xs font-medium transition-colors">
                  View Asset Details
                </button>
              </div>

              {/* Evidence Section */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-ink border-b border-line pb-2">Detection Evidence</h3>
                {selectedEvent.evidence && selectedEvent.evidence.length > 0 ? (
                  <div className="flex flex-col gap-3 pt-2">
                    {selectedEvent.evidence.map((sig, i) => (
                      <EvidenceBar 
                        key={i}
                        name={sig.name}
                        observed={sig.value}
                        threshold={sig.threshold}
                        triggered={sig.triggered}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-ink-faint italic pt-2">
                    No individual signals triggered thresholds.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Correlation Matrix Panel */}
      {showCorrelation && !selectedEvent && (
        <div className="border-t border-line p-4 bg-void/30 shrink-0 animate-fade-in">
          <CorrelationMatrix />
        </div>
      )}
    </div>
  )
}
