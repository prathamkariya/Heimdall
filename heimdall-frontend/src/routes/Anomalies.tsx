import { useState, useEffect, useCallback } from 'react'
import { useApiFetch } from '../lib/hooks'
import { useKeyboardNav } from '../lib/useKeyboardNav'
import { Pagination } from '../components/Pagination'
import { AnomalyDetail } from '../components/AnomalyDetail'
import { EmptyState } from '../components/EmptyState'
import { Skeleton } from '../components/Skeleton'
import { formatDate } from '../lib/utils'
import { useSettings } from '../lib/SettingsContext'
import type { AnomalyListItem, AnomalyPaginatedResponse } from '../lib/types'

const PAGE_SIZE = 20

export function Anomalies() {
  const { timezone } = useSettings()
  const { data, loading, error, execute: executeAnomalies } = useApiFetch<AnomalyPaginatedResponse>()
  const { data: casesResponse, execute: executeCases } = useApiFetch<{items: any[]}>()
  const cases = casesResponse?.items || []

  // Filters
  const [symbolFilter, setSymbolFilter] = useState('')
  const [anomalyOnly, setAnomalyOnly] = useState(true)
  const [offset, setOffset] = useState(0)

  // Detail panel
  const [selected, setSelected] = useState<AnomalyListItem | null>(null)

  const fetchCases = useCallback(() => {
    executeCases('/cases?limit=100')
  }, [executeCases])

  const handleCaseUpdated = () => {
    fetchCases()
  }

  useEffect(() => {
    fetchCases()
  }, [fetchCases])

  const fetchAnomalies = useCallback(() => {
    const params = new URLSearchParams()
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))
    if (symbolFilter.trim()) params.set('symbol', symbolFilter.trim().toUpperCase())
    if (anomalyOnly) params.set('is_anomaly', 'true')

    executeAnomalies(`/anomalies?${params}`)
  }, [executeAnomalies, offset, symbolFilter, anomalyOnly])

  useEffect(() => {
    fetchAnomalies()
  }, [fetchAnomalies])
  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [symbolFilter, anomalyOnly])

  const { focusedIndex } = useKeyboardNav({
    itemCount: data?.items.length || 0,
    onSelect: (index) => {
      if (data?.items[index]) {
        setSelected(data.items[index])
      }
    },
    onClose: () => setSelected(null),
    isActive: true
  })

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
        <div className="grid grid-cols-[60px_100px_85px_90px_85px_130px_1fr] gap-x-3 border-b border-line bg-surface px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          <span>ID</span>
          <span>Symbol</span>
          <span>Market</span>
          <span>Score</span>
          <span>Severity</span>
          <span>Primary Signal</span>
          <span>Detected</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-0.5 pt-2">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="grid w-full grid-cols-[60px_100px_85px_90px_85px_130px_1fr] gap-x-3 border-b border-line/40 px-5 py-2.5 items-center">
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-24 rounded" />
                  <Skeleton className="h-4 w-32" />
                </div>
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
            <EmptyState 
              title="No Anomalies Found"
              description="There are currently no anomalies matching your filters."
              icon="shield"
            />
          )}

          {!loading && !error && data?.items.map((item, index) => {
            const severity = item.severity
            const primarySignal = item.primary_signal || 'NORMAL'
            const isFocused = index === focusedIndex
            return (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className={`grid w-full grid-cols-[60px_100px_85px_90px_85px_130px_1fr] gap-x-3 border-b border-line/40 px-4 py-1.5 text-left font-mono text-[13px] transition-all active:scale-[0.99] hover:bg-raised/60 ${
                  selected?.id === item.id 
                    ? 'bg-raised/60 border-l-2 border-l-accent' 
                    : isFocused
                      ? 'bg-raised/30 border-l-2 border-l-ink-dim/50'
                      : item.model_version === null ? 'border-l-2 border-l-transparent' : 'border-l-2 border-l-transparent'
                }`}
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
                  {severity ? (
                    <span className={`text-[9px] font-mono tracking-wider rounded px-1 py-0.5 border ${
                      severity === 'CRITICAL' ? 'text-down bg-down/10 border-down/25 font-bold' :
                      severity === 'HIGH' ? 'text-down bg-down/10 border-down/20' :
                      severity === 'MEDIUM' ? 'text-accent bg-accent/10 border-accent/20' :
                      'text-ink-dim bg-raised border-line'
                    }`}>
                      {severity}
                    </span>
                  ) : (
                    <span className="text-ink-faint text-[11px]">—</span>
                  )}
                </span>
                <span>
                  <span className={`text-[11px] rounded px-1.5 py-0.5 border ${
                    primarySignal === 'PUMP & DUMP'
                      ? 'bg-down/10 text-down border-down/20 font-medium'
                      : primarySignal === 'WASH TRADING'
                        ? 'bg-accent/10 text-accent border-accent/20'
                        : 'bg-raised text-ink-dim border-line'
                  }`}>
                    {primarySignal}
                  </span>
                </span>
                <span className="text-ink-dim tabular text-[12px]">
                  {formatDt(item.detected_at, timezone)}
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
        <AnomalyDetail
          anomaly={selected}
          cases={cases}
          onClose={() => setSelected(null)}
          onCaseUpdated={handleCaseUpdated}
          onSelectAnomaly={setSelected}
        />
      )}
    </div>
  )
}

function formatDt(ts: string, timezone: 'local' | 'utc'): string {
  return formatDate(ts, timezone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
