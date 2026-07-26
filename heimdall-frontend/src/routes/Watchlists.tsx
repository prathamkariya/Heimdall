import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { Plus, Trash2, X, AlertTriangle } from 'lucide-react'

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
  const [watchlists, setWatchlists] = useState<WatchlistListItem[]>([])
  const [selected, setSelected] = useState<Watchlist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // Add symbol form
  const [symbolInput, setSymbolInput] = useState('')
  const [addingSymbol, setAddingSymbol] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/watchlists') as WatchlistListItem[]
      setWatchlists(res)
    } catch (err: any) {
      setError(err?.message || 'Failed to load watchlists')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetail = useCallback(async (id: number) => {
    try {
      const res = await apiFetch(`/watchlists/${id}`) as Watchlist
      setSelected(res)
    } catch (err: any) {
      setError(err?.message || 'Failed to load watchlist')
    }
  }, [])

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
      setError(err?.message || 'Failed to create watchlist')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/watchlists/${id}`, { method: 'DELETE' })
      if (selected?.id === id) setSelected(null)
      await fetchList()
    } catch (err: any) {
      setError(err?.message || 'Failed to delete watchlist')
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
      setError(err?.message || 'Failed to add symbol')
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
      setError(err?.message || 'Failed to remove symbol')
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
              className={`group flex flex-col border-b border-line px-4 py-3 transition-colors cursor-pointer select-none ${
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
                  className="rounded p-1 text-ink-faint opacity-0 transition-all group-hover:opacity-100 hover:text-down cursor-pointer"
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
          <div className="flex h-full items-center justify-center text-sm text-ink-faint">
            Select a watchlist to manage symbols
          </div>
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

            {/* Symbol list */}
            <div className="flex-1 overflow-y-auto">
              {selected.symbols.length === 0 && (
                <div className="px-5 py-8 text-center text-[12px] text-ink-faint">
                  No symbols in this watchlist
                </div>
              )}

              {selected.symbols.map((sym) => (
                <div
                  key={sym.id}
                  className="group flex items-center justify-between border-b border-line/40 px-5 py-2"
                >
                  <div>
                    <span className="font-mono text-[13px] font-medium text-ink">{sym.symbol}</span>
                    {sym.notes && (
                      <span className="ml-3 text-[11px] text-ink-faint">{sym.notes}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveSymbol(sym.symbol)}
                    className="rounded p-1 text-ink-faint opacity-0 transition-all group-hover:opacity-100 hover:text-down"
                    aria-label={`Remove ${sym.symbol}`}
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 border border-down/30 bg-down-dim/20 px-4 py-2 text-sm text-down shadow-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-[10px] text-down/60 hover:text-down"
          >
            DISMISS
          </button>
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
