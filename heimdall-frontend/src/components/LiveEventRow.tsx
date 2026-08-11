import React from 'react'
import type { LiveAlertEvent } from '../lib/types'

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

export function SeverityBadge({ severity }: { severity: string }) {
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

interface LiveEventRowProps {
  event: LiveAlertEvent
  scored: boolean
  primarySignal: string
  isNew: boolean
  isSelected: boolean
  isFocused: boolean
  onClick: () => void
}

export const LiveEventRow = React.memo(function LiveEventRow({
  event,
  scored,
  primarySignal,
  isNew,
  isSelected,
  isFocused,
  onClick
}: LiveEventRowProps) {
  return (
    <div 
      data-testid="live-event-row"
      className={`border-b border-line/40 font-mono text-[13px] transition-all active:scale-[0.99] cursor-pointer ${
        isSelected 
          ? 'bg-raised/40 border-l-2 border-l-accent'
          : isFocused
            ? 'bg-raised/30 border-l-2 border-l-ink-dim/50'
            : scored 
              ? ((event.anomaly_score ?? 0) >= 0.7 
                  ? 'bg-down/10 text-down border-l-2 border-l-down/30' 
                  : 'text-ink hover:bg-raised/20 border-l-2 border-l-transparent') 
              : 'text-ink-faint italic hover:bg-raised/10 border-l-2 border-l-transparent'
      }`}
      onClick={onClick}
    >
      {/* Main row */}
      <div
        className={`grid grid-cols-[110px_90px_95px_75px_60px_120px_75px_1fr_16px] gap-x-4 px-5 py-1.5 pl-[18px] items-center ${
          isNew && !isSelected ? (scored && (event.anomaly_score ?? 0) >= 0.7 ? 'animate-row-flash-red' : 'animate-row-flash') : ''
        }`}
      >
        <span className="truncate font-semibold text-ink">{event.symbol}</span>
        <span className="text-ink-dim text-[11px]">
          {event.market === 'US_EQUITY' ? 'EQUITY' : event.market}
        </span>
        <span className="tabular-nums font-medium">
          {event.price != null ? event.price.toFixed(2) : '—'}
        </span>
        <span className="tabular-nums text-ink-dim">{event.volume != null ? (event.volume > 1000 ? (event.volume/1000).toFixed(1)+'k' : event.volume.toFixed(1)) : '—'}</span>

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
        
        {/* Expand indicator */}
        <span className="text-ink-faint text-[10px] self-center">
          <span className={isSelected ? "text-accent" : ""}>
            {isSelected ? '▶' : ''}
          </span>
        </span>
      </div>
    </div>
  )
})
