import { NavLink } from 'react-router-dom'
import { Activity, TriangleAlert, Eye, FileText } from 'lucide-react'
import type { Market } from '../lib/types'

const NAV_ITEMS = [
  { to: '/', label: 'Live Feed', icon: Activity, end: true },
  { to: '/anomalies', label: 'Anomalies', icon: TriangleAlert, end: false },
  { to: '/watchlists', label: 'Watchlists', icon: Eye, end: false },
  { to: '/reports', label: 'Reports', icon: FileText, end: false },
]

// Placeholder until GET /health/models (or equivalent) is wired up.
// Kept as its own typed shape now so swapping the source is a one-line
// change later, not a redesign.
const MODEL_STATUS: { market: Market; healthy: boolean }[] = [
  { market: 'CRYPTO', healthy: true },
  { market: 'US_EQUITY', healthy: true },
  { market: 'INDIA_EQUITY', healthy: false },
]

export function Rail() {
  return (
    <nav className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-4 py-4">
        <span className="font-mono text-sm font-medium tracking-wide text-ink">
          HEIMDALL
        </span>
      </div>

      <ul className="flex-1 px-2 py-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-raised text-ink'
                    : 'text-ink-dim hover:bg-raised/60 hover:text-ink'
                }`
              }
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Model-status footer — the visible payoff of the backend's
          per-market registry isolation. Quiet, always present, not a
          banner: a reviewer who notices it reads it as evidence, not
          decoration. */}
      <div className="border-t border-line px-4 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          Model Status
        </div>
        <ul className="space-y-1">
          {MODEL_STATUS.map(({ market, healthy }) => (
            <li
              key={market}
              className="flex items-center justify-between font-mono text-[11px] text-ink-dim"
            >
              <span>{market}</span>
              <span className={healthy ? 'text-up' : 'text-ink-faint'}>
                {healthy ? '●' : '○'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
