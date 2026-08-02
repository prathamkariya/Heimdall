import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, TriangleAlert, Eye, LogOut, FolderGit, Search, Archive, Settings, Cpu } from 'lucide-react'
import { useAuth } from '../lib/auth-context'
import { apiFetch } from '../lib/api'
import { LogoLockup } from '../brand'
import { SettingsModal } from '../components/SettingsModal'
import { ModelStatusModal } from '../components/ModelStatusModal'

const NAV_ITEMS = [
  { to: '/', label: 'Live Feed', icon: Activity, end: true },
  { to: '/anomalies', label: 'Anomalies', icon: TriangleAlert, end: false },
  { to: '/watchlists', label: 'Watchlists', icon: Eye, end: false },
  { to: '/investigations', label: 'Investigations', icon: FolderGit, end: false },
  { to: '/audit', label: 'Audit & Reports', icon: Archive, end: false },
]

export function Rail() {
  const { logout, logoutAll, isAuthenticated } = useAuth()
  const [openCasesCount, setOpenCasesCount] = useState<number | null>(null)
  const [demoMode, setDemoMode] = useState(() => localStorage.getItem('heimdall_demo_mode') === 'true')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isModelStatusOpen, setIsModelStatusOpen] = useState(false)

  // Listen for the 'open_model_status' custom event so CommandPalette (or any
  // route) can trigger the Model Engine modal without drilling props.
  useEffect(() => {
    const handler = () => setIsModelStatusOpen(true)
    window.addEventListener('open_model_status', handler)
    return () => window.removeEventListener('open_model_status', handler)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return

    const fetchOpenCases = async () => {
      try {
        const res = await apiFetch('/cases?limit=100') as any
        const count = (res.items || []).filter((c: any) => !['CLOSED', 'DISMISSED'].includes(c.status)).length
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
      <div className="border-b border-line px-5 py-5 flex items-center justify-start">
        <LogoLockup size={24} orientation="horizontal" variant="gold-accent" showTagline={false} />
      </div>

      {/* Command Palette Trigger */}
      <div className="border-b border-line px-4 py-4">
        <button 
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="w-full flex items-center justify-between bg-void border border-line hover:border-line/80 px-2.5 py-1.5 rounded transition-fast text-ink-faint group cursor-text"
        >
          <div className="flex items-center gap-2">
            <Search size={13} className="group-hover:text-ink transition-fast" />
            <span className="text-[11px] font-brand group-hover:text-ink transition-fast mt-0.5">Search...</span>
          </div>
          <span className="font-mono text-[9px] bg-raised px-1.5 py-0.5 rounded border border-line/60 flex items-center gap-0.5">
            <span className="text-[10px]">⌘</span>K
          </span>
        </button>
      </div>

      <div className="px-4 pt-4 pb-2 text-[10px] font-brand font-semibold tracking-wider text-ink-faint uppercase">
        Overview
      </div>

      <ul className="flex-1 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
            >
              {({ isActive }) => (
                <div className={`group relative mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-brand transition-fast ${
                  isActive
                    ? 'bg-raised text-ink font-medium'
                    : 'text-ink-dim hover:bg-white/[0.03] hover:text-ink'
                }`}>
                  {isActive && (
                    <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-sm bg-accent" />
                  )}
                  <Icon 
                    size={16} 
                    strokeWidth={isActive ? 2 : 1.75} 
                    className={isActive ? 'text-accent opacity-100' : 'opacity-65 group-hover:opacity-100 transition-fast'} 
                  />
                  <div className="flex flex-col">
                    <span>{label}</span>
                    {label === 'Investigations' && openCasesCount !== null && (
                      <span className={`text-[10px] font-mono mt-0.5 ${openCasesCount > 0 ? 'text-accent' : 'text-ink-faint'}`}>
                        {openCasesCount} Open
                      </span>
                    )}
                  </div>
                </div>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Demo Mode Toggle */}
      <div className="border-t border-line px-4 py-3">
        <label className="flex items-center justify-between cursor-pointer group">
          <div className="flex flex-col">
            <span className="text-[11px] font-mono font-medium text-ink group-hover:text-accent transition-colors">Demo Mode</span>
            <span className="text-[9px] font-mono text-ink-faint mt-0.5">Simulate Live Data</span>
          </div>
          <div className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${demoMode ? 'bg-accent' : 'bg-line'}`}>
            <input 
              type="checkbox" 
              className="sr-only" 
              checked={demoMode}
              onChange={(e) => {
                const isChecked = e.target.checked
                setDemoMode(isChecked)
                localStorage.setItem('heimdall_demo_mode', isChecked ? 'true' : 'false')
                window.dispatchEvent(new Event('demo_mode_change'))
              }}
            />
            <span className={`inline-block h-3 w-3 transform rounded-full transition-transform ${demoMode ? 'translate-x-3.5 bg-void' : 'translate-x-0.5 bg-surface'}`} />
          </div>
        </label>
      </div>

      {/* Session & Engine controls */}
      <div className="border-t border-line px-2 py-3 space-y-0.5">
        <button
          onClick={() => setIsModelStatusOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-ink-dim transition-fast hover:bg-raised/60 hover:text-ink"
        >
          <Cpu size={15} strokeWidth={1.75} className="text-accent" />
          Model Engine
        </button>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-ink-dim transition-fast hover:bg-raised/60 hover:text-ink"
        >
          <Settings size={15} strokeWidth={1.75} />
          Settings
        </button>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-ink-dim transition-fast hover:bg-raised/60 hover:text-ink"
        >
          <LogOut size={15} strokeWidth={1.75} />
          Sign Out
        </button>
        <button
          onClick={logoutAll}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 font-mono text-[10px] text-ink-faint transition-fast hover:text-down"
        >
          REVOKE ALL SESSIONS
        </button>
      </div>

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      {isModelStatusOpen && <ModelStatusModal onClose={() => setIsModelStatusOpen(false)} />}
    </nav>
  )
}
