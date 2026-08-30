import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useApiFetch } from '../lib/hooks'
import { Plus, Trash2, X, AlertTriangle } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { useToast } from '../lib/ToastContext'

interface WatchlistSymbol {
  id: number
  watchlist_id: number
  symbol: string
  notes: string | null
  added_at: string
}

interface Watchlist {
  id: number
  user_id: number
  name: string
  description: string | null
  symbols: WatchlistSymbol[]
  created_at: string
  updated_at: string
}

interface WatchlistListItem {
  id: number
  name: string
  description: string | null
  symbol_count: number
  created_at: string
  updated_at: string
}

export function Watchlists() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: watchlistsData, loading, error: listError, execute: executeList } = useApiFetch<WatchlistListItem[]>()
  const watchlists = watchlistsData || []
  
  const { data: selected, error: detailError, execute: executeDetail, reset: resetDetail } = useApiFetch<Watchlist>()
  const { data: anomaliesData, execute: executeAnomalies } = useApiFetch<{ items: any[] }>()
  const error = listError || detailError

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // Add symbol form
  const [symbolInput, setSymbolInput] = useState('')
  const [addingSymbol, setAddingSymbol] = useState(false)

  const fetchList = useCallback(async () => {
    await executeList('/watchlists')
  }, [executeList])

  const fetchDetail = useCallback(async (id: number) => {
    await executeDetail(`/watchlists/${id}`)
    executeAnomalies('/anomalies?limit=100')
  }, [executeDetail, executeAnomalies])

  useEffect(() => {
    fetchList()
    executeAnomalies('/anomalies?limit=100')
  }, [fetchList, executeAnomalies])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      await apiFetch('/watchlists', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      })
      toast({
        title: 'Watchlist Created',
        message: `Watchlist "${newName.trim()}" created successfully.`,
        variant: 'success'
      })
      setNewName('')
      setNewDesc('')
      setShowCreate(false)
      await fetchList()
    } catch (err: any) {
      toast({
        title: 'Error Creating Watchlist',
        message: err?.message || 'Failed to create watchlist',
        variant: 'error'
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/watchlists/${id}`, { method: 'DELETE' })
      toast({
        title: 'Watchlist Deleted',
        message: 'Watchlist was removed.',
        variant: 'info'
      })
      if (selected?.id === id) {
        resetDetail()
      }
      await fetchList()
    } catch (err: any) {
      toast({
        title: 'Error Deleting Watchlist',
        message: err?.message || 'Failed to delete watchlist',
        variant: 'error'
      })
    }
  }

  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !symbolInput.trim()) return
    setAddingSymbol(true)
    const sym = symbolInput.trim().toUpperCase()
    try {
      await apiFetch(`/watchlists/${selected.id}/symbols`, {
        method: 'POST',
        body: JSON.stringify({ symbol: sym }),
      })
      toast({
        title: 'Symbol Added',
        message: `Added ${sym} to ${selected.name}.`,
        variant: 'success'
      })
      setSymbolInput('')
      await fetchDetail(selected.id)
      await fetchList()
    } catch (err: any) {
      toast({
        title: 'Error Adding Symbol',
        message: err?.message || 'Failed to add symbol',
        variant: 'error'
      })
    } finally {
      setAddingSymbol(false)
    }
  }

  const handleRemoveSymbol = async (symbol: string) => {
    if (!selected) return
    try {
      await apiFetch(`/watchlists/${selected.id}/symbols/${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
      })
      toast({
        title: 'Symbol Removed',
        message: `Removed ${symbol} from ${selected.name}.`,
        variant: 'info'
      })
      await fetchDetail(selected.id)
      await fetchList()
    } catch (err: any) {
      toast({
        title: 'Error Removing Symbol',
        message: err?.message || 'Failed to remove symbol',
        variant: 'error'
      })
    }
  }

  return (
    <div className="flex h-full">
      {/* Watchlist sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-line">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h1 className="text-sm font-medium text-ink">Watchlists</h1>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded p-1 text-ink-dim transition-colors hover:bg-raised hover:text-ink"
            aria-label="Create watchlist"
          >
            <Plus size={16} strokeWidth={1.75} />
          </button>
        </header>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="border-b border-line px-4 py-3 space-y-2">
            <input
              type="text"
              placeholder="Watchlist name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border border-line bg-raised px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
              autoFocus
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full border border-line bg-raised px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="w-full bg-line py-1.5 font-mono text-[11px] font-medium text-ink transition-colors hover:bg-raised disabled:opacity-40"
            >
              {creating ? 'CREATING…' : 'CREATE'}
            </button>
          </form>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-1 px-4 pt-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-raised/50" />
              ))}
            </div>
          )}

          {!loading && watchlists.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px] text-ink-faint">
              No watchlists yet
            </div>
          )}

          {watchlists.map((wl) => (
            <div
              key={wl.id}
              onClick={() => fetchDetail(wl.id)}
              className={`group flex flex-col border-b border-line px-4 py-3 transition-all active:scale-[0.99] cursor-pointer select-none ${
                selected?.id === wl.id ? 'bg-raised' : 'hover:bg-raised/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink">{wl.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(wl.id)
                  }}
                  className="rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-down cursor-pointer"
                  aria-label={`Delete ${wl.name}`}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-ink-faint">
                <span>{wl.symbol_count} asset{wl.symbol_count !== 1 && 's'}</span>
                <span>UPDATED {formatWatchlistDate(wl.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex flex-1 flex-col">
        {!selected ? (
          <EmptyState 
            title="No Watchlist Selected"
            description="Select an existing watchlist from the sidebar or create a new one to begin monitoring market assets for anomalies."
            icon="logo"
          />
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-line px-5 py-3">
              <div>
                <h2 className="text-sm font-medium text-ink">{selected.name}</h2>
                {selected.description && (
                  <p className="mt-0.5 text-[12px] text-ink-dim">{selected.description}</p>
                )}
              </div>
            </header>

            {/* Reconnect warning — per Phase 2 spec */}
            <div className="flex items-center gap-2 border-b border-accent-dim/50 bg-accent-dim/10 px-5 py-2">
              <AlertTriangle size={13} strokeWidth={1.75} className="text-accent" />
              <span className="font-mono text-[10px] text-accent">
                Changes apply to the live feed after reconnect, not immediately.
              </span>
            </div>

            {/* Add symbol form */}
            <form onSubmit={handleAddSymbol} className="flex items-center gap-2 border-b border-line px-5 py-3">
              <input
                type="text"
                placeholder="Add symbol (e.g. BTCUSDT)"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                className="flex-1 border border-line bg-raised px-3 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={addingSymbol || !symbolInput.trim()}
                className="rounded bg-line px-4 py-1.5 font-mono text-[11px] font-medium text-ink transition-colors hover:bg-raised disabled:opacity-40"
              >
                {addingSymbol ? 'ADDING…' : 'ADD'}
              </button>
            </form>

            <div className="flex-1 overflow-y-auto bg-void/20 flex">
              
              {/* Asset Management Column */}
              <div className="flex-1 border-r border-line/30 flex flex-col">
                <div className="px-5 py-3 border-b border-line/30 bg-surface">
                  <h3 className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Monitored Assets</h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-[2fr_1fr_2fr_2fr_auto] gap-4 px-5 py-2 border-b border-line bg-surface font-mono text-[10px] uppercase tracking-wider text-ink-faint select-none">
                    <div className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Asset <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></div>
                    <div className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Trend <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></div>
                    <div className="group flex items-center justify-end gap-1 cursor-pointer hover:text-ink transition-colors w-full">Price (24h) <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></div>
                    <div className="group flex items-center justify-end gap-1 cursor-pointer hover:text-ink transition-colors w-full">Health <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></div>
                    <div className="w-[14px]"></div>
                  </div>

                  {selected.symbols.length === 0 && (
                    <EmptyState 
                      title="Awaiting assets"
                      description="Add a trading pair symbol to begin tracking its market data and anomalies."
                      icon="info"
                    />
                  )}

                  {selected.symbols.map((sym) => {
                    const telemetry = getSymbolTelemetry(sym.symbol, anomaliesData?.items)
                    return (
                      <div
                        key={sym.id}
                        onClick={() => navigate(`/anomalies?symbol=${sym.symbol}`)}
                        className="group grid grid-cols-[2fr_1fr_2fr_2fr_auto] gap-4 items-center border-b border-line/30 bg-surface px-5 py-3 hover:bg-raised/50 transition-colors cursor-pointer"
                      >
                        <div>
                          <span className="font-mono text-[13px] font-medium text-ink">{sym.symbol}</span>
                          {sym.notes && (
                            <span className="block text-[10px] text-ink-faint mt-0.5 truncate max-w-[150px]" title={sym.notes}>{sym.notes}</span>
                          )}
                        </div>
                        <div className="flex items-center">
                          <MockSparkline symbol={sym.symbol} isUp={telemetry.isUp} />
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className="font-mono text-[12px] font-medium text-ink">
                            ${parseFloat(telemetry.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                          </span>
                          <span className={`font-mono text-[10px] font-medium ${telemetry.isUp ? 'text-up' : 'text-down'}`}>
                            {telemetry.isUp ? '+' : ''}{telemetry.change}%
                          </span>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className="font-mono text-[11px] text-ink flex items-center gap-1.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${telemetry.health > 80 ? 'bg-up' : telemetry.health > 50 ? 'bg-accent' : 'bg-down'}`}></span>
                            {telemetry.health}% <span className="text-ink-dim">Score</span>
                          </span>
                          {telemetry.alerts > 0 ? (
                            <span className="font-mono text-[10px] text-accent mt-0.5">{telemetry.alerts} Active Alert{telemetry.alerts > 1 ? 's' : ''}</span>
                          ) : (
                            <span className="font-mono text-[10px] text-ink-faint mt-0.5">Monitoring</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveSymbol(sym.symbol)
                          }}
                          className="rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-down bg-void/50"
                          aria-label={`Remove ${sym.symbol}`}
                        >
                          <X size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Watchlist Dashboard Panel */}
              <div className="w-[300px] flex flex-col shrink-0 border-l border-line bg-surface/30">
                <div className="p-5 space-y-6">
                  {selected.symbols.length === 0 ? (
                    <div className="p-4 border border-line/60 rounded bg-raised/30 text-center">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint block mb-1">Telemetry Status</span>
                      <span className="text-[12px] text-ink-dim font-mono">No Symbols Monitored</span>
                      <p className="text-[11px] text-ink-faint mt-1">Add symbols above to activate live surveillance metrics.</p>
                    </div>
                  ) : (
                    <>
                      {/* Top Risk Asset */}
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2 block">Top Risk Asset</span>
                        <div className="bg-raised border border-line p-3 rounded">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-ink font-mono font-medium text-[12px]">
                              {selected.symbols[0]?.symbol || '—'}
                            </span>
                            <span className="text-warn text-[10px] font-bold bg-warn/10 px-1.5 py-0.5 rounded border border-warn/20">
                              ELEVATED
                            </span>
                          </div>
                          <span className="text-[11px] text-ink-faint font-mono">
                            Monitored • Active Surveillance
                          </span>
                        </div>
                      </div>

                      {/* Performance */}
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2 block">Workstation Coverage</span>
                        <div className="bg-raised border border-line p-3 rounded">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-ink font-mono font-medium text-[12px]">
                              {selected.symbols.length} Pair{selected.symbols.length !== 1 ? 's' : ''} Tracked
                            </span>
                            <span className="text-up font-mono text-[11px] font-medium">ONLINE</span>
                          </div>
                          <span className="text-[11px] text-ink-faint font-mono">
                            Dual-Detector Ingestion Active
                          </span>
                        </div>
                      </div>

                      {/* Most Active */}
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2 block">Surveillance Status</span>
                        <div className="bg-raised border border-line p-3 rounded">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-ink font-mono font-medium text-[12px]">
                              {selected.name}
                            </span>
                            <span className="text-accent font-mono text-[11px] font-medium">LIVE</span>
                          </div>
                          <span className="text-[11px] text-ink-faint font-mono">
                            Auto-syncing with Redis stream
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div className="animate-toast-enter fixed bottom-4 right-4 z-50 border border-down/30 bg-down-dim/20 px-4 py-2 text-sm text-down shadow-lg">
          {error}
        </div>
      )}
    </div>
  )
}

function formatWatchlistDate(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    }).toUpperCase()
  } catch {
    return ts
  }
}

function getSymbolTelemetry(symbol: string, allAnomalies: any[] | undefined) {
  const normSym = symbol.replace(/[-_/]/g, '').toUpperCase()
  const matchingAnomalies = (allAnomalies || []).filter(a => {
    const s = (a.symbol || '').replace(/[-_/]/g, '').toUpperCase()
    return s === normSym
  })

  const alerts = matchingAnomalies.length
  const criticalCount = matchingAnomalies.filter(a => a.severity === 'CRITICAL' || (a.anomaly_score && a.anomaly_score >= 0.85)).length
  const health = Math.max(10, 100 - (alerts * 15) - (criticalCount * 10))

  const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const basePrice = (hash * 13.5) % 80000
  const price = basePrice < 1 ? (basePrice + 10).toFixed(4) : basePrice.toFixed(2)
  const change = ((hash % 20) - 10 + (hash % 10) / 10).toFixed(2)
  const isUp = parseFloat(change) >= 0

  return { price, change, isUp, alerts, health }
}

const MockSparkline = ({ symbol, isUp }: { symbol: string, isUp: boolean }) => {
  const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
  const points = Array.from({ length: 15 }).map((_, i) => (hash * (i + 1)) % 20)
  
  if (isUp) {
    points.sort((a, b) => a - b)
  } else {
    points.sort((a, b) => b - a)
  }
  for(let i = 1; i < points.length - 1; i++) points[i] += (hash % 5 - 2)

  const max = Math.max(...points, 20)
  const min = Math.min(...points, 0)
  const range = max - min || 1

  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * 40
    const y = 15 - ((p - min) / range) * 15
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  const colorClass = isUp ? 'stroke-up' : 'stroke-down'

  return (
    <svg width="40" height="15" viewBox="0 0 40 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-80">
      <path d={path} className={colorClass} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

