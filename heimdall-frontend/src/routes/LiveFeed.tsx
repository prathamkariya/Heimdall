import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKeyboardNav } from '../lib/useKeyboardNav'
import { ConnectionStatus } from '../components/ConnectionStatus'
import type { LiveAlertEvent } from '../lib/types'
import { isScoredAlert } from '../lib/types'
import { SignalStrength } from '../components/SignalStrength'
import { EvidenceBar } from '../components/EvidenceBar'
import { CorrelationMatrix } from '../components/CorrelationMatrix'
import { useMarketDataStream } from '../lib/useMarketDataStream'
import { LiveEventRow, SeverityBadge } from '../components/LiveEventRow'
import { useToast } from '../lib/ToastContext'
import { apiFetch } from '../lib/api'

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
  const navigate = useNavigate()
  const { toast } = useToast()
  const [selectedEvent, setSelectedEvent] = useState<LiveAlertEvent | null>(null)
  const [isCreatingCase, setIsCreatingCase] = useState(false)
  const [timeStr, setTimeStr] = useState('')
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem('heimdall_demo_mode') === 'true')
  const [showCorrelation, setShowCorrelation] = useState(false)
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'CRYPTO' | 'US_EQUITY'>('ALL')
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('ALL')
  const [audioChime, setAudioChime] = useState(() => localStorage.getItem('heimdall_audio_chime') === 'true')
  const containerRef = useRef<HTMLDivElement>(null)

  const handleCreateCaseFromEvent = async () => {
    if (!selectedEvent || isCreatingCase) return
    setIsCreatingCase(true)
    try {
      const anomalyId = (selectedEvent as any).id || (selectedEvent as any).anomaly_id
      const payload: any = {
        title: `Surveillance Alert: ${selectedEvent.symbol} ${selectedEvent.primary_signal || 'Anomaly'}`,
      }
      if (anomalyId) {
        payload.anomaly_ids = [anomalyId]
      }
      const res: any = await apiFetch('/cases', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      toast({
        title: 'Investigation Case Created',
        message: `Case #${res?.id ?? 'NEW'} initiated for ${selectedEvent.symbol}`,
        variant: 'success'
      })
      navigate('/investigations')
    } catch (err: any) {
      toast({
        title: 'Failed to Create Case',
        message: err.message || 'Could not create investigation case.',
        variant: 'error'
      })
    } finally {
      setIsCreatingCase(false)
    }
  }

  const handleViewAssetDetails = () => {
    if (!selectedEvent) return
    navigate(`/anomalies?symbol=${encodeURIComponent(selectedEvent.symbol)}`)
  }

  // Use our enhanced stream hook
  const { events, connState, isPaused, togglePause, bufferedCount, velocity } = useMarketDataStream(isDemoMode)

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

  // Audio alert for critical anomalies
  useEffect(() => {
    if (!audioChime || events.length === 0) return
    const newest = events[0]
    if (newest?.severity === 'CRITICAL') {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, audioCtx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.15)
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15)
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        osc.start()
        osc.stop(audioCtx.currentTime + 0.15)
      } catch {
        // ignore
      }
    }
  }, [events, audioChime])

  const toggleAudio = () => {
    const next = !audioChime
    setAudioChime(next)
    localStorage.setItem('heimdall_audio_chime', next.toString())
  }

  // Filter events
  const filteredEvents = events.filter(e => {
    if (marketFilter !== 'ALL' && e.market !== marketFilter) return false
    if (severityFilter === 'CRITICAL' && e.severity !== 'CRITICAL') return false
    if (severityFilter === 'HIGH' && e.severity !== 'CRITICAL' && e.severity !== 'HIGH') return false
    if (severityFilter === 'MEDIUM' && !['CRITICAL', 'HIGH', 'MEDIUM'].includes(e.severity || '')) return false
    return true
  })

  const { focusedIndex } = useKeyboardNav({
    itemCount: filteredEvents.length,
    onSelect: (index) => setSelectedEvent(filteredEvents[index]),
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
          {/* Velocity Rate Meter */}
          <span className="font-mono text-[10px] text-ink-faint border-l border-line pl-3">
            Rate: <span className="text-ink font-semibold">{velocity}</span> evt/min
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] text-ink-faint">
          {/* Pause / Resume button */}
          <button
            onClick={togglePause}
            className={`font-mono text-[10px] px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 ${
              isPaused 
                ? 'bg-warn/20 border-warn/40 text-warn font-semibold animate-pulse' 
                : 'bg-surface border-line text-ink-faint hover:text-ink'
            }`}
            title="Pause stream to inspect anomalies (Spacebar)"
          >
            {isPaused ? `⏸ PAUSED (${bufferedCount} buffered)` : '▶ LIVE'}
          </button>

          {/* Audio Chime Button */}
          <button
            onClick={toggleAudio}
            className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors ${
              audioChime ? 'bg-accent/15 border-accent/30 text-accent font-semibold' : 'bg-surface border-line text-ink-faint hover:text-ink'
            }`}
            title="Toggle audio ping on CRITICAL manipulation events"
          >
            {audioChime ? '🔔 CHIME ON' : '🔕 MUTE'}
          </button>

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
          <span className="tabular border-l border-line pl-3">{timeStr}</span>
          <span className="border-l border-line h-3 pl-3">
            {filteredEvents.length} event{filteredEvents.length !== 1 && 's'}
          </span>
        </div>
      </header>

      {/* Control / Filter Bar */}
      <div className="flex items-center justify-between border-b border-line bg-surface/50 px-5 py-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <span className="text-ink-faint mr-1">Market:</span>
            {(['ALL', 'CRYPTO', 'US_EQUITY'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMarketFilter(m)}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  marketFilter === m ? 'bg-raised text-ink border-accent font-semibold' : 'text-ink-faint border-transparent hover:text-ink'
                }`}
              >
                {m === 'US_EQUITY' ? 'EQUITY' : m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 font-mono text-[10px] border-l border-line pl-4">
            <span className="text-ink-faint mr-1">Min Severity:</span>
            {(['ALL', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  severityFilter === s ? 'bg-raised text-ink border-accent font-semibold' : 'text-ink-faint border-transparent hover:text-ink'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {isPaused && (
          <span className="font-mono text-[10px] text-warn bg-warn/10 px-2 py-0.5 rounded border border-warn/20">
            Stream Paused • Press [▶ LIVE] to resume
          </span>
        )}
      </div>

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
            {filteredEvents.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center text-ink-faint font-mono text-[11px] gap-2">
                <p>No events match the active filters.</p>
                <p className="text-[10px] text-ink-dim">Adjust severity or market filters above.</p>
              </div>
            ) : null}

            {filteredEvents.map((event, i) => {
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
                <button
                  onClick={handleCreateCaseFromEvent}
                  disabled={isCreatingCase}
                  className="w-full bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 py-2 rounded text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isCreatingCase ? 'Creating Case…' : 'Create Investigation Case'}
                </button>
                <button
                  onClick={handleViewAssetDetails}
                  className="w-full bg-surface hover:bg-raised text-ink-dim border border-line py-2 rounded text-xs font-medium transition-colors cursor-pointer"
                >
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
