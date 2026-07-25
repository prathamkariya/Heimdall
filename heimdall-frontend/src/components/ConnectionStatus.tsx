/**
 * Three-state SSE connection indicator.
 *
 * All three states are visually distinct — this is required because
 * SSE auto-reconnects on network blips, and the user needs to know
 * if their feed is live or stale regardless of hosting setup.
 */

type ConnectionState = 'connecting' | 'live' | 'reconnecting'

const STATE_CONFIG: Record<ConnectionState, { label: string; dotClass: string; textClass: string }> = {
  connecting: {
    label: 'CONNECTING',
    dotClass: 'bg-accent animate-pulse',
    textClass: 'text-accent',
  },
  live: {
    label: 'LIVE',
    dotClass: 'bg-accent',
    textClass: 'text-accent',
  },
  reconnecting: {
    label: 'RECONNECTING',
    dotClass: 'bg-down animate-pulse',
    textClass: 'text-down',
  },
}

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const cfg = STATE_CONFIG[state]

  return (
    <div className="flex items-center gap-2 font-mono text-[11px] tracking-wider">
      <span className={`inline-block h-2 w-2 rounded-full ${cfg.dotClass}`} />
      <span className={cfg.textClass}>{cfg.label}</span>
    </div>
  )
}
