import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, TriangleAlert, Eye, FileText, LogOut, Shield, FolderGit } from 'lucide-react'
import { useAuth } from '../lib/auth-context'
import { apiFetch } from '../lib/api'
import type { Market } from '../lib/types'

const NAV_ITEMS = [
  { to: '/', label: 'Live Feed', icon: Activity, end: true },
  { to: '/anomalies', label: 'Anomalies', icon: TriangleAlert, end: false },
  { to: '/watchlists', label: 'Watchlists', icon: Eye, end: false },
  { to: '/reports', label: 'Reports', icon: FileText, end: false },
  { to: '/investigations', label: 'Investigations', icon: FolderGit, end: false },
]

// Placeholder until GET /health/models (or equivalent) is wired up.
const MODEL_STATUS: { market: Market; healthy: boolean }[] = [
  { market: 'CRYPTO', healthy: true },
  { market: 'US_EQUITY', healthy: true },
  { market: 'INDIA_EQUITY', healthy: false },
]

export function Rail() {
  const { logout, logoutAll, isAuthenticated } = useAuth()
  const [openCasesCount, setOpenCasesCount] = useState<number | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return

    const fetchOpenCases = async () => {
      try {
        const res = await apiFetch('/cases?limit=100') as any
        const count = (res.items || []).filter((c: any) => c.status === 'OPEN').length
        setOpenCasesCount(count)
      } catch (err) {
        console.error('Failed to fetch open cases count', err)
      }
    }

    fetchOpenCases()
    const interval = setInterval(fetchOpenCases, 12000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-surface select-none">
      {/* Brand */}
      <div className="border-b border-line px-4 py-4 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded border border-line bg-void">
          <Shield size={14} className="text-accent" strokeWidth={1.75} />
        </div>
        <div>
          <span className="font-mono text-sm font-medium tracking-[0.15em] text-ink">
            HEIMDALL
          </span>
          <div className="font-mono text-[8px] tracking-wider text-ink-faint uppercase">
            Market Surveillance Platform
          </div>
        </div>
      </div>

      {/* Ctrl + K command bar prompt */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center gap-2 rounded-md border border-line bg-void px-2.5 py-1.5 font-mono text-[10px] text-ink-faint hover:border-ink-faint/30 transition-colors cursor-pointer">
          <span>Search command...</span>
          <kbd className="ml-auto rounded bg-raised px-1 border border-line text-[9px] font-mono">⌘K</kbd>
        </div>
      </div>

      <ul className="flex-1 px-2 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-all duration-150 ${
                  isActive
                    ? 'bg-raised text-ink border-l-2 border-accent'
                    : 'text-ink-dim hover:bg-raised/60 hover:text-ink border-l-2 border-transparent'
                }`
              }
            >
              <Icon size={15} strokeWidth={1.75} />
              <div className="flex flex-col">
                <span>{label}</span>
                {label === 'Investigations' && openCasesCount !== null && (
                  <span className="text-[10px] text-ink-faint font-mono mt-0.5">
                    {openCasesCount} Open
                  </span>
                )}
              </div>
            </NavLink>
          </li>
        ))}
      </ul>

      {/* System Overview Block */}
      <div className="border-t border-line px-4 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          System Overview
        </div>
        <dl className="grid grid-cols-2 gap-y-1.5 font-mono text-[10px]">
          <dt className="text-ink-faint">STATE</dt>
          <dd className="text-right">
            <span className="inline-flex items-center gap-1 text-up">
              <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse" />
              LIVE
            </span>
          </dd>
          <dt className="text-ink-faint">MODELS</dt>
          <dd className="text-right text-ink-dim">
            {MODEL_STATUS.filter(m => m.healthy).length}/{MODEL_STATUS.length} ACTIVE
          </dd>
        </dl>
      </div>

      {/* Model-status footer */}
      <div className="border-t border-line px-4 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          Model Registry
        </div>
        <ul className="space-y-1.5 font-mono text-[10px]">
          {MODEL_STATUS.map(({ market, healthy }) => (
            <li
              key={market}
              className="flex items-center justify-between"
            >
              <span className="text-ink-dim">{market.replace('_', ' ')}</span>
              <span className={`inline-flex items-center gap-1 ${healthy ? 'text-up' : 'text-down font-medium'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${healthy ? 'bg-up' : 'bg-down animate-pulse'}`} />
                {healthy ? 'ONLINE' : 'DEGRADED'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Session controls */}
      <div className="border-t border-line px-2 py-3 space-y-0.5">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-ink-dim transition-colors hover:bg-raised/60 hover:text-ink"
        >
          <LogOut size={15} strokeWidth={1.75} />
          Sign Out
        </button>
        <button
          onClick={logoutAll}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 font-mono text-[10px] text-ink-faint transition-colors hover:text-down"
        >
          REVOKE ALL SESSIONS
        </button>
      </div>
    </nav>
  )
}
