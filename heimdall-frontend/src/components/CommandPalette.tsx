import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, Activity, TriangleAlert, FolderGit, Eye, Archive, Settings, FileText, ArrowUp, ArrowDown, CornerDownLeft } from 'lucide-react'
import { apiFetch } from '../lib/api'

type CommandItem = {
  id: string
  group: string
  label: string
  desc?: string
  icon: any
  typeLabel: string
  onSelect: () => void
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  
  const [remoteResults, setRemoteResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      } else if (e.key === '/' && !isOpen && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setIsOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const actions: CommandItem[] = [
    { id: 'nav-live', group: 'NAVIGATION', label: 'Live Feed', desc: 'Real-time monitoring', icon: Activity, typeLabel: 'Navigation', onSelect: () => navigate('/') },
    { id: 'nav-anomalies', group: 'NAVIGATION', label: 'Anomalies', desc: 'Detected suspicious activity', icon: TriangleAlert, typeLabel: 'Navigation', onSelect: () => navigate('/anomalies') },
    { id: 'nav-watchlists', group: 'NAVIGATION', label: 'Watchlists', desc: 'Tracked assets', icon: Eye, typeLabel: 'Navigation', onSelect: () => navigate('/watchlists') },
    { id: 'nav-investigations', group: 'NAVIGATION', label: 'Investigations', desc: 'Active cases', icon: FolderGit, typeLabel: 'Navigation', onSelect: () => navigate('/investigations') },
    { id: 'nav-audit', group: 'NAVIGATION', label: 'Audit & Reports', desc: 'Exported findings', icon: Archive, typeLabel: 'Navigation', onSelect: () => navigate('/audit') },
    { id: 'cmd-report', group: 'COMMANDS', label: 'Generate Report', desc: 'Create a new MAR', icon: FileText, typeLabel: 'Command', onSelect: () => navigate('/audit') },
    { id: 'cmd-demo', group: 'COMMANDS', label: 'Toggle Demo Mode', desc: 'Switch to simulated data', icon: Settings, typeLabel: 'System', onSelect: () => {
        const current = localStorage.getItem('heimdall_demo_mode') === 'true'
        localStorage.setItem('heimdall_demo_mode', (!current).toString())
        window.dispatchEvent(new Event('demo_mode_change'))
    }},
  ]

  const recentMocks: CommandItem[] = [
    { id: 'rec-1', group: 'RECENT', label: 'DOGEUSDT', desc: 'Asset • High Risk', icon: Activity, typeLabel: 'Asset', onSelect: () => navigate('/anomalies') },
    { id: 'rec-2', group: 'RECENT', label: 'Case #1837', desc: 'Open Investigation', icon: FolderGit, typeLabel: 'Case', onSelect: () => navigate('/investigations') },
    { id: 'rec-3', group: 'RECENT', label: 'BTCUSDT', desc: 'Asset', icon: Activity, typeLabel: 'Asset', onSelect: () => navigate('/anomalies') },
    { id: 'rec-4', group: 'RECENT', label: 'Audit Report', desc: 'Exported findings', icon: Archive, typeLabel: 'Report', onSelect: () => navigate('/audit') },
  ]

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setRemoteResults([])
      return
    }
    
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiFetch(`/search?q=${encodeURIComponent(trimmed)}`) as any
        setRemoteResults(res.results || [])
      } catch (err) {
        console.error('Search failed', err)
        setRemoteResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    
    return () => clearTimeout(timer)
  }, [query])

  const filteredActions: CommandItem[] = query.trim() === '' 
    ? [...recentMocks, ...actions.filter(a => a.group === 'COMMANDS')]
    : [
        ...actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()) || (a.desc && a.desc.toLowerCase().includes(query.toLowerCase()))),
        ...remoteResults.map((r: any) => ({
          id: r.id,
          group: r.type === 'case' ? 'CASES' : r.type === 'asset' ? 'ASSETS' : 'RESULTS',
          label: r.title,
          desc: r.subtitle,
          icon: r.type === 'case' ? FolderGit : Activity,
          typeLabel: r.type,
          onSelect: () => navigate(r.route)
        }))
      ]

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'ArrowDown' || (e.key === 'j' && !query)) {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < filteredActions.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp' || (e.key === 'k' && !query)) {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const action = filteredActions[selectedIndex]
      if (action) {
        action.onSelect()
        setIsOpen(false)
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-void/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-lg bg-surface border border-line rounded-lg shadow-2xl overflow-hidden animate-fade-in-zoom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-line">
          <Search size={16} className="text-ink-faint mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-[13px] font-mono text-ink outline-none border-none focus:ring-0 focus:border-none focus:outline-none p-0 m-0 shadow-none placeholder:text-ink-faint/50"
            placeholder="Search assets, cases, or type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="font-mono text-[9px] text-ink-faint uppercase bg-raised px-1.5 py-0.5 rounded border border-line border-b-2 border-b-line/80 shadow-sm flex items-center gap-2 shrink-0 ml-3">
            {loading ? <Loader2 size={10} className="animate-spin" /> : null}
            ESC
          </span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredActions.map((action, i) => {
            const isNewGroup = i === 0 || action.group !== filteredActions[i - 1].group
            return (
              <div key={action.id}>
                {isNewGroup && (
                  <div className="px-3 py-1.5 text-[9px] font-brand font-bold text-ink-faint tracking-[0.2em] uppercase border-b border-line/30 mb-1 mt-2 first:mt-0">
                    {action.group}
                  </div>
                )}
                <button
                  onClick={() => { action.onSelect(); setIsOpen(false); }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded font-mono text-[11px] transition-fast ${
                    i === selectedIndex ? 'bg-selected text-ink border-l-2 border-l-accent shadow-sm' : 'text-ink-dim hover:bg-selected/50 hover:text-ink border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <action.icon size={14} className={i === selectedIndex ? 'text-accent' : 'text-ink-faint'} />
                    <div className="flex flex-col gap-0.5">
                      <span className={i === selectedIndex ? 'text-ink' : ''}>{action.label}</span>
                      {action.desc && <span className="text-[10px] text-ink-faint">{action.desc}</span>}
                    </div>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-ink-faint bg-surface border border-line px-1.5 py-0.5 rounded shadow-sm">{action.typeLabel}</span>
                </button>
              </div>
            )
          })}
          {filteredActions.length === 0 && (
            <div className="px-6 py-12 text-center flex flex-col items-center justify-center">
              <Search size={24} className="text-ink-faint/30 mb-4" />
              <div className="font-mono text-sm text-ink-dim mb-2">No matching results found</div>
              <div className="font-mono text-[10px] text-ink-faint">
                Press <span className="bg-raised px-1 py-0.5 rounded border border-line mx-1">Enter</span> to search externally or create a Watchlist.
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-line px-4 py-2 bg-raised/30 flex items-center justify-between font-mono text-[9px] text-ink-faint uppercase select-none">
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5"><span className="flex items-center bg-surface border border-line border-b-2 border-b-line/80 px-1 py-0.5 rounded shadow-sm gap-0.5"><ArrowUp size={10}/><ArrowDown size={10}/></span> Navigate</span>
            <span className="flex items-center gap-1.5"><span className="flex items-center bg-surface border border-line border-b-2 border-b-line/80 px-1 py-0.5 rounded shadow-sm"><CornerDownLeft size={10}/></span> Open</span>
          </div>
          <span className="flex items-center gap-1.5"><span className="flex items-center bg-surface border border-line border-b-2 border-b-line/80 px-1 py-0.5 rounded shadow-sm text-[8px] font-bold">ESC</span> Close</span>
        </div>
      </div>
    </div>
  )
}
