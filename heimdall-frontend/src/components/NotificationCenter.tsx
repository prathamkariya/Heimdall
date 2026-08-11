import { useState, useEffect, useCallback } from 'react'
import { Bell, X, AlertTriangle, Cpu, FolderGit, CheckCheck, Trash2 } from 'lucide-react'
import { apiFetch } from '../lib/api'

type NotifCategory = 'critical' | 'system' | 'investigations'

interface Notification {
  id: string
  category: NotifCategory
  title: string
  body: string
  timestamp: Date
  read: boolean
  actionLabel?: string
  actionPayload?: Record<string, unknown>
  severity?: 'high' | 'medium' | 'low'
}

const CATEGORY_ICONS: Record<NotifCategory, React.ReactNode> = {
  critical: <AlertTriangle size={12} className="text-down" />,
  system: <Cpu size={12} className="text-accent" />,
  investigations: <FolderGit size={12} className="text-ink-dim" />,
}

const CATEGORY_LABEL: Record<NotifCategory, string> = {
  critical: 'Critical Signals',
  system: 'System & Engine',
  investigations: 'Investigations',
}

let _listeners: (() => void)[] = []
let _notifs: Notification[] = []
let _nextId = 1

/** Push a new notification globally from any module */
// eslint-disable-next-line react-refresh/only-export-components
export function pushNotification(notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) {
  _notifs = [
    { ...notif, id: `notif-${_nextId++}`, timestamp: new Date(), read: false },
    ..._notifs,
  ].slice(0, 50) // keep last 50
  _listeners.forEach(fn => fn())
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<NotifCategory | 'all'>('all')
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [bellPulse, setBellPulse] = useState(false)

  // Subscribe to global push
  useEffect(() => {
    const handler = () => setNotifs([..._notifs])
    _listeners.push(handler)
    // Seed initial from API state
    seedFromApi()
    return () => {
      _listeners = _listeners.filter(l => l !== handler)
    }
  }, [])

  const seedFromApi = async () => {
    try {
      // Fetch recent high-severity anomalies as initial critical notifications
      const data = await apiFetch('/anomalies?limit=5') as any
      const items = (data?.items ?? []) as any[]
      for (const item of items) {
        if ((item.anomaly_score ?? 0) >= 0.8) {
          const existing = _notifs.find(n => n.id === `anomaly-${item.id}`)
          if (!existing) {
            _notifs.push({
              id: `anomaly-${item.id}`,
              category: 'critical',
              title: `${item.primary_signal ?? 'Anomaly Detected'} — ${item.symbol}`,
              body: `Score ${((item.anomaly_score ?? 0) * 100).toFixed(0)}% · ${item.severity ?? 'HIGH'} severity · ${item.market}`,
              timestamp: new Date(item.detected_at ?? Date.now()),
              read: false,
              severity: 'high',
              actionLabel: 'View Anomaly',
            })
          }
        }
      }
      // Fetch open cases as investigation notifications
      const cases = await apiFetch('/cases?limit=5') as any
      const caseItems = (cases?.items ?? []) as any[]
      for (const c of caseItems.filter((c: any) => c.status === 'OPEN').slice(0, 3)) {
        const existing = _notifs.find(n => n.id === `case-${c.id}`)
        if (!existing) {
          _notifs.push({
            id: `case-${c.id}`,
            category: 'investigations',
            title: `Open Case: ${c.title}`,
            body: `CASE-${String(c.id).padStart(6, '0')} · ${c.status} · Awaiting review`,
            timestamp: new Date(c.created_at ?? Date.now()),
            read: false,
            actionLabel: 'Go to Investigation',
          })
        }
      }
      setNotifs([..._notifs])
    } catch {
      // API not available — seed a system notification
      if (_notifs.length === 0) {
        _notifs.push({
          id: 'sys-init',
          category: 'system',
          title: 'HEIMDALL Engine Online',
          body: 'Surveillance platform initialized. Monitoring CRYPTO and US_EQUITY markets.',
          timestamp: new Date(),
          read: false,
        })
        setNotifs([..._notifs])
      }
    }
  }

  const unreadCount = notifs.filter(n => !n.read).length

  const markRead = useCallback((id: string) => {
    _notifs = _notifs.map(n => n.id === id ? { ...n, read: true } : n)
    setNotifs([..._notifs])
  }, [])

  const markAllRead = useCallback(() => {
    _notifs = _notifs.map(n => ({ ...n, read: true }))
    setNotifs([..._notifs])
  }, [])

  const dismiss = useCallback((id: string) => {
    _notifs = _notifs.filter(n => n.id !== id)
    setNotifs([..._notifs])
  }, [])

  const clearAll = useCallback(() => {
    _notifs = []
    setNotifs([])
  }, [])

  // Animate bell on new unread
  useEffect(() => {
    if (unreadCount > 0 && !open) {
      setBellPulse(true)
      const t = setTimeout(() => setBellPulse(false), 500)
      return () => clearTimeout(t)
    }
  }, [unreadCount, open])

  // Close on Escape, open on Shift+N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'N' && e.shiftKey) setOpen(prev => !prev)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const displayedNotifs = activeTab === 'all'
    ? notifs
    : notifs.filter(n => n.category === activeTab)

  const countForTab = (tab: NotifCategory | 'all') =>
    tab === 'all'
      ? notifs.filter(n => !n.read).length
      : notifs.filter(n => n.category === tab && !n.read).length

  const relativeTime = (d: Date): string => {
    const secs = Math.floor((Date.now() - d.getTime()) / 1000)
    if (secs < 60) return `${secs}s ago`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ago`
  }

  return (
    <>
      {/* Bell trigger */}
      <button
        id="notification-center-trigger"
        aria-label="Open notifications"
        onClick={() => {
          setOpen(prev => !prev)
          if (!open) markAllRead()
        }}
        className={`relative flex items-center justify-center w-7 h-7 rounded-md transition-fast cursor-pointer hover:bg-raised ${open ? 'bg-raised text-ink' : 'text-ink-faint hover:text-ink'}`}
        title="Notifications (Shift+N)"
      >
        <Bell size={15} strokeWidth={1.75} className={bellPulse ? 'animate-bell-pulse' : ''} />
        {unreadCount > 0 && !open && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-down text-void font-mono text-[8px] flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div
            className="absolute right-4 top-14 w-[360px] bg-surface border border-line rounded-xl shadow-2xl animate-slide-in-bottom overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-void/60">
              <div className="flex items-center gap-2">
                <Bell size={13} className="text-accent" />
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink">
                  Notification Center
                </span>
                {notifs.length > 0 && (
                  <span className="font-mono text-[9px] text-ink-faint bg-raised px-1.5 py-0.5 rounded">
                    {notifs.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {notifs.length > 0 && (
                  <>
                    <button
                      onClick={markAllRead}
                      className="text-ink-faint hover:text-ink text-[10px] font-mono flex items-center gap-1 transition-fast cursor-pointer"
                      title="Mark all read"
                    >
                      <CheckCheck size={11} />
                    </button>
                    <button
                      onClick={clearAll}
                      className="text-ink-faint hover:text-down text-[10px] font-mono flex items-center gap-1 transition-fast cursor-pointer"
                      title="Clear all"
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="text-ink-faint hover:text-ink transition-fast cursor-pointer rounded-full p-0.5 hover:bg-raised"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-line px-4 pt-1">
              {(['all', 'critical', 'system', 'investigations'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative pb-2 pt-1.5 mr-4 text-[10px] font-mono font-semibold uppercase tracking-wider border-b-2 transition-fast cursor-pointer ${
                    activeTab === tab
                      ? 'border-accent text-accent'
                      : 'border-transparent text-ink-faint hover:text-ink'
                  }`}
                >
                  {tab === 'all' ? 'All' : CATEGORY_LABEL[tab].split(' ')[0]}
                  {countForTab(tab) > 0 && (
                    <span className="absolute -top-0.5 -right-2 h-3.5 w-3.5 rounded-full bg-down text-void font-mono text-[8px] flex items-center justify-center">
                      {countForTab(tab)}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Notification list */}
            <div className="overflow-y-auto max-h-[420px]">
              {displayedNotifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell size={24} className="text-ink-faint/40 mb-3" />
                  <div className="text-[12px] font-mono text-ink-faint">No notifications</div>
                  <div className="text-[10px] font-mono text-ink-faint/60 mt-1">All clear</div>
                </div>
              ) : (
                displayedNotifs.map(notif => (
                  <div
                    key={notif.id}
                    className={`group flex gap-3 px-4 py-3 border-b border-line/50 hover:bg-raised/30 transition-fast ${!notif.read ? 'bg-raised/10' : ''}`}
                    onClick={() => markRead(notif.id)}
                  >
                    {/* Category icon */}
                    <div className="mt-0.5 shrink-0">
                      {CATEGORY_ICONS[notif.category]}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-[12px] font-medium leading-tight truncate ${!notif.read ? 'text-ink' : 'text-ink-dim'}`}>
                          {notif.title}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!notif.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); dismiss(notif.id) }}
                            className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-down transition-fast cursor-pointer"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-ink-faint mt-0.5 leading-relaxed line-clamp-2">
                        {notif.body}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[9px] font-mono text-ink-faint/60">
                          {relativeTime(notif.timestamp)}
                        </span>
                        {notif.actionLabel && (
                          <button
                            className="text-[9px] font-mono text-accent hover:text-accent/80 transition-fast cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {notif.actionLabel} →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer keyboard shortcut hint */}
            <div className="px-4 py-2 border-t border-line/50 bg-void/30 flex items-center gap-2">
              <span className="text-[9px] font-mono text-ink-faint/50">
                Shift+N to toggle · Esc to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
