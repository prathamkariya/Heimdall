import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { useApiFetch } from '../lib/hooks'
import { Plus, Trash2, X, AlertTriangle } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'

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
  const { data: watchlistsData, loading, error: listError, execute: executeList } = useApiFetch<WatchlistListItem[]>()
  const watchlists = watchlistsData || []
  
  const { data: selected, error: detailError, execute: executeDetail, reset: resetDetail } = useApiFetch<Watchlist>()
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
  }, [executeDetail])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      await apiFetch('/watchlists', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      })
      setNewName('')
      setNewDesc('')
      setShowCreate(false)
      await fetchList()
    } catch (err: any) {
      alert(err?.message || 'Failed to create watchlist')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/watchlists/${id}`, { method: 'DELETE' })
      if (selected?.id === id) {
        resetDetail()
      }
      await fetchList()
    } catch (err: any) {
      alert(err?.message || 'Failed to delete watchlist')
    }
  }

  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !symbolInput.trim()) return
    setAddingSymbol(true)
    try {
      await apiFetch(`/watchlists/${selected.id}/symbols`, {
        method: 'POST',
        body: JSON.stringify({ symbol: symbolInput.trim() }),
      })
      setSymbolInput('')
      await fetchDetail(selected.id)
      await fetchList()
    } catch (err: any) {
      alert(err?.message || 'Failed to add symbol')
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
      await fetchDetail(selected.id)
      await fetchList()
    } catch (err: any) {
      alert(err?.message || 'Failed to remove symbol')
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
                  <div className="grid grid-cols-[2fr_1fr_2fr_2fr_auto] gap-4 px-5 py-2 border-b border-line/30 bg-void/50 text-[10px] uppercase font-mono text-ink-faint tracking-wider sticky top-0 z-10 backdrop-blur-md">
                    <div>Asset</div>
                    <div>Trend</div>
                    <div className="text-right">Price (24h)</div>
                    <div className="text-right">Health</div>
                    <div className="w-[14px]"></div>
                  </div>

                  {selected.symbols.length === 0 && (
                    <div className="px-5 py-8 text-center text-[12px] text-ink-faint italic font-mono">
                      No symbols in this watchlist
                    </div>
                  )}

                  {selected.symbols.map((sym) => {
                    const mock = getMockData(sym.symbol)
                    return (
                      <div
                        key={sym.id}
                        className="group grid grid-cols-[2fr_1fr_2fr_2fr_auto] gap-4 items-center border-b border-line/30 bg-surface px-5 py-3 hover:bg-raised/50 transition-colors"
                      >
                        <div>
                          <span className="font-mono text-[13px] font-medium text-ink">{sym.symbol}</span>
                          {sym.notes && (
                            <span className="block text-[10px] text-ink-faint mt-0.5 truncate max-w-[150px]" title={sym.notes}>{sym.notes}</span>
                          )}
                        </div>
                        <div className="flex items-center">
                          <MockSparkline symbol={sym.symbol} isUp={mock.isUp} />
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className="font-mono text-[12px] font-medium text-ink">
                            ${parseFloat(mock.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                          </span>
                          <span className={`font-mono text-[10px] font-medium ${mock.isUp ? 'text-up' : 'text-down'}`}>
                            {mock.isUp ? '+' : ''}{mock.change}%
                          </span>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className="font-mono text-[11px] text-ink flex items-center gap-1.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${mock.health > 80 ? 'bg-up' : mock.health > 50 ? 'bg-accent' : 'bg-down'}`}></span>
                            {mock.health}% <span className="text-ink-dim">Score</span>
                          </span>
                          {mock.alerts > 0 ? (
                            <span className="font-mono text-[10px] text-accent mt-0.5">{mock.alerts} Active Alert{mock.alerts > 1 ? 's' : ''}</span>
                          ) : (
                            <span className="font-mono text-[10px] text-ink-faint mt-0.5">Monitoring</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveSymbol(sym.symbol)}
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
              <div className="w-[300px] flex flex-col shrink-0 bg-surface/50">
                <div className="p-5 space-y-6">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2 block">Latest Detection</span>
                    <div className="bg-raised border border-line/50 p-3 rounded">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-ink font-mono font-medium text-[12px]">BTCUSDT</span>
                        <span className="text-down text-[10px] font-bold bg-down/10 px-1 rounded">HIGH</span>
                      </div>
                      <span className="text-[11px] text-ink-faint">Volume Spike • 12 mins ago</span>
                    </div>
                  </div>

                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2 block">24h Activity Overview</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-void/40 border border-line/30 p-2.5 rounded text-center">
                        <span className="text-[18px] font-mono text-ink block">{selected.symbols.length}</span>
                        <span className="text-[9px] uppercase font-mono text-ink-faint">Assets</span>
                      </div>
                      <div className="bg-void/40 border border-line/30 p-2.5 rounded text-center">
                        <span className="text-[18px] font-mono text-accent block">3</span>
                        <span className="text-[9px] uppercase font-mono text-ink-faint">Anomalies</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2 block">Performance & Volatility</span>
                    <div className="bg-void/40 border border-line/30 p-3 rounded">
                      <div className="text-[11px] font-mono text-ink-dim flex justify-between mb-1">
                        <span>Avg Volatility</span>
                        <span className="text-up">+2.4%</span>
                      </div>
                      <div className="text-[11px] font-mono text-ink-dim flex justify-between">
                        <span>Highest Risk</span>
                        <span className="text-down font-medium">DOGEUSDT</span>
                      </div>
                    </div>
                  </div>

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

function getMockData(symbol: string) {
  const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const basePrice = (hash * 13.5) % 80000
  const price = basePrice < 1 ? (basePrice + 10).toFixed(4) : basePrice.toFixed(2)
  const change = ((hash % 20) - 10 + (hash % 10) / 10).toFixed(2)
  const isUp = parseFloat(change) >= 0
  const alerts = hash % 5
  const health = 100 - (hash % 30)
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
