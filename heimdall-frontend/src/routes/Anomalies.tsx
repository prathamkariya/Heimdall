import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { Pagination } from '../components/Pagination'
import { AnomalyDetail } from '../components/AnomalyDetail'
import type { AnomalyListItem, AnomalyPaginatedResponse } from '../lib/types'

const PAGE_SIZE = 20

export function Anomalies() {
  const [data, setData] = useState<AnomalyPaginatedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [symbolFilter, setSymbolFilter] = useState('')
  const [anomalyOnly, setAnomalyOnly] = useState(true)
  const [offset, setOffset] = useState(0)

  // Detail panel
  const [selected, setSelected] = useState<AnomalyListItem | null>(null)

  const fetchAnomalies = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(offset))
      if (symbolFilter.trim()) params.set('symbol', symbolFilter.trim().toUpperCase())
      if (anomalyOnly) params.set('is_anomaly', 'true')

      const res = await apiFetch(`/anomalies?${params}`) as AnomalyPaginatedResponse
      setData(res)
    } catch (err: any) {
      setError(err?.message || 'Failed to load anomalies')
    } finally {
      setLoading(false)
    }
  }, [offset, symbolFilter, anomalyOnly])

  useEffect(() => {
    fetchAnomalies()
  }, [fetchAnomalies])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [symbolFilter, anomalyOnly])

  return (
    <div className="flex h-full">
      {/* Main list */}
      <div className="flex flex-1 flex-col">
        {/* Header + filters */}
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h1 className="text-sm font-medium text-ink">Anomalies</h1>

          <div className="flex items-center gap-4">
            {/* Symbol filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="symbol-filter" className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                Symbol
              </label>
              <input
                id="symbol-filter"
                type="text"
                placeholder="BTC, ETH…"
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                className="w-24 border border-line bg-raised px-2 py-1 font-mono text-[12px] text-ink outline-none transition-colors focus:border-accent"
              />
            </div>

            {/* Anomaly-only toggle */}
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={anomalyOnly}
                onChange={(e) => setAnomalyOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                Anomalies only
              </span>
            </label>
          </div>
        </header>

        {/* Column headers */}
        <div className="grid grid-cols-[60px_100px_80px_90px_80px_1fr] gap-x-3 border-b border-line bg-surface px-5 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          <span>ID</span>
          <span>Symbol</span>
          <span>Market</span>
          <span>Score</span>
          <span>Severity</span>
          <span>Detected</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-0.5 px-5 pt-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-raised/50" />
              ))}
            </div>
          )}

          {error && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-down">{error}</p>
              <button
                onClick={fetchAnomalies}
                className="mt-3 font-mono text-[11px] text-accent hover:underline"
              >
                RETRY
              </button>
            </div>
          )}

          {!loading && !error && data && data.items.length === 0 && (
            <div className="flex h-32 items-center justify-center text-sm text-ink-faint">
              No anomalies found
            </div>
          )}

          {!loading && !error && data?.items.map((item) => {
            const severity = (item as any).severity as string | undefined
            return (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className={`grid w-full grid-cols-[60px_100px_80px_90px_80px_1fr] gap-x-3 border-b border-line/40 px-5 py-2 text-left font-mono text-[13px] transition-colors hover:bg-raised/40 ${
                  selected?.id === item.id ? 'bg-raised/60' : ''
                } ${item.model_version === null ? 'border-l-2 border-l-accent' : ''}`}
              >
                <span className="text-ink-faint tabular">{item.id}</span>
                <span className="font-medium text-ink truncate">{item.symbol}</span>
                <span className="text-ink-dim">{item.market}</span>
                <span className={
                  item.anomaly_score >= 0.8
                    ? 'text-down tabular'
                    : item.anomaly_score >= 0.5
                      ? 'text-accent tabular'
                      : 'text-ink-dim tabular'
                }>
                  {item.anomaly_score.toFixed(4)}
                </span>
                <span>
                  {severity && (
                    <span className={`text-[10px] font-medium uppercase ${
                      severity === 'CRITICAL' ? 'text-down' :
                      severity === 'HIGH' ? 'text-down/70' :
                      severity === 'MEDIUM' ? 'text-accent' :
                      'text-ink-faint'
                    }`}>
                      {severity}
                    </span>
                  )}
                </span>
                <span className="text-ink-dim tabular text-[12px]">
                  {formatDetectedAt(item.detected_at)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Pagination */}
        {data && (
          <Pagination
            total={data.total}
            limit={data.limit}
            offset={data.offset}
            onPageChange={setOffset}
          />
        )}
      </div>

      {/* Detail slide-in */}
      {selected && (
        <AnomalyDetail anomaly={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function formatDetectedAt(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return ts
  }
}
