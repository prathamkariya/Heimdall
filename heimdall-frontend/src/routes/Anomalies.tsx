import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Columns } from 'lucide-react'
import { useApiFetch } from '../lib/hooks'
import { useKeyboardNav } from '../lib/useKeyboardNav'
import { Pagination } from '../components/Pagination'
import { AnomalyDetail } from '../components/AnomalyDetail'
import { EmptyState } from '../components/EmptyState'
import { Skeleton } from '../components/Skeleton'
import { formatDate } from '../lib/utils'
import { useSettings } from '../lib/SettingsContext'
import type { AnomalyListItem, AnomalyPaginatedResponse } from '../lib/types'

const PAGE_SIZE = 50

const ALL_COLUMNS = ['ID', 'Symbol', 'Market', 'Score', 'Severity', 'Primary Signal', 'Detected']

export function Anomalies() {
  const { timezone } = useSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSymbol = searchParams.get('symbol') || ''

  const { data, loading, error, execute: executeAnomalies } = useApiFetch<AnomalyPaginatedResponse>()
  const { data: casesResponse, execute: executeCases } = useApiFetch<{items: any[]}>()
  const cases = casesResponse?.items || []

  // Filters
  const [symbolFilter, setSymbolFilter] = useState(urlSymbol)
  const [anomalyOnly, setAnomalyOnly] = useState(false)
  const [offset, setOffset] = useState(0)

  // Keep symbol filter in sync with URL searchParams
  useEffect(() => {
    const sym = searchParams.get('symbol') || ''
    setSymbolFilter(sym)
  }, [searchParams])

  // Columns state
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('heimdall_visible_columns')
    if (saved) {
      try { return JSON.parse(saved) } catch (e) { console.warn("Failed to parse saved column visibility", e) }
    }
    return ALL_COLUMNS
  })
  const [showColumnDropdown, setShowColumnDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('heimdall_visible_columns', JSON.stringify(visibleColumns))
  }, [visibleColumns])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowColumnDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  // Construct grid columns string dynamically
  const colSizes: Record<string, string> = {
    'ID': '60px',
    'Symbol': '100px',
    'Market': '85px',
    'Score': '90px',
    'Severity': '85px',
    'Primary Signal': '130px',
    'Detected': '1fr'
  }
  
  const gridTemplateColumns = visibleColumns.map(c => colSizes[c] || '100px').join(' ')
  const gridStyle = { gridTemplateColumns }

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

  // Auto-select anomaly when symbol filter is present
  useEffect(() => {
    if (data?.items && data.items.length > 0 && symbolFilter.trim()) {
      const match = data.items.find(item => item.symbol.toUpperCase() === symbolFilter.trim().toUpperCase())
      setSelected(match || data.items[0])
    }
  }, [data, symbolFilter])

  const handleSymbolChange = (val: string) => {
    setSymbolFilter(val)
    if (val.trim()) {
      setSearchParams({ symbol: val.trim() }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }

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
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium text-ink">Anomalies</h1>
            <span className="font-mono text-[10px] text-ink-faint">
              {data?.total || 0} RECORD{data?.total !== 1 && 'S'}
            </span>
          </div>

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
                onChange={(e) => handleSymbolChange(e.target.value)}
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

            {/* Columns Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setShowColumnDropdown(!showColumnDropdown)}
                className="flex items-center gap-1.5 border border-line bg-surface hover:bg-raised px-2 py-1 font-mono text-[10px] text-ink transition-colors rounded"
              >
                <Columns size={12} />
                COLUMNS
              </button>
              
              {showColumnDropdown && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-line rounded shadow-2xl z-50 p-2 font-mono text-[11px] animate-fade-in-zoom origin-top-right">
                  <div className="text-ink-faint uppercase tracking-wider text-[9px] mb-2 px-1">Visible Columns</div>
                  {ALL_COLUMNS.map(col => (
                    <label key={col} className="flex items-center gap-2 p-1.5 hover:bg-raised rounded cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        checked={visibleColumns.includes(col)}
                        onChange={() => toggleColumn(col)}
                        className="accent-accent"
                        disabled={visibleColumns.length === 1 && visibleColumns.includes(col)}
                      />
                      <span className={visibleColumns.includes(col) ? 'text-ink' : 'text-ink-dim'}>{col}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Column headers */}
        <div className="grid gap-x-3 border-b border-line bg-surface px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint select-none" style={gridStyle}>
          {visibleColumns.includes('ID') && <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">ID <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>}
          {visibleColumns.includes('Symbol') && <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Symbol <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>}
          {visibleColumns.includes('Market') && <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Market <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>}
          {visibleColumns.includes('Score') && <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Score <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>}
          {visibleColumns.includes('Severity') && <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Severity <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>}
          {visibleColumns.includes('Primary Signal') && <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Primary Signal <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>}
          {visibleColumns.includes('Detected') && <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Detected <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>}
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-0.5 pt-2">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="grid w-full gap-x-3 border-b border-line/40 px-5 py-2.5 items-center" style={gridStyle}>
                  {visibleColumns.includes('ID') && <Skeleton className="h-4 w-10" />}
                  {visibleColumns.includes('Symbol') && <Skeleton className="h-4 w-16" />}
                  {visibleColumns.includes('Market') && <Skeleton className="h-4 w-12" />}
                  {visibleColumns.includes('Score') && <Skeleton className="h-4 w-14" />}
                  {visibleColumns.includes('Severity') && <Skeleton className="h-4 w-16" />}
                  {visibleColumns.includes('Primary Signal') && <Skeleton className="h-5 w-24 rounded" />}
                  {visibleColumns.includes('Detected') && <Skeleton className="h-4 w-32" />}
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
              title="Awaiting sufficient market data"
              description="No anomalies detected within the current filter parameters."
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
                className={`grid w-full gap-x-3 border-b border-line/40 px-4 py-1.5 text-left font-mono text-[13px] transition-fast hover:bg-raised/60 ${
                  selected?.id === item.id 
                    ? 'bg-selected border-l-2 border-l-accent' 
                    : isFocused
                      ? 'bg-raised/30 border-l-2 border-l-line'
                      : 'border-l-2 border-l-transparent'
                }`}
                style={gridStyle}
              >
                {visibleColumns.includes('ID') && <span className="text-ink-faint tabular">{item.id}</span>}
                {visibleColumns.includes('Symbol') && <span className="font-medium text-ink truncate">{item.symbol}</span>}
                {visibleColumns.includes('Market') && <span className="text-ink-dim">{item.market}</span>}
                {visibleColumns.includes('Score') && (
                  <span className={
                    item.anomaly_score >= 0.8
                      ? 'text-down tabular'
                      : item.anomaly_score >= 0.5
                        ? 'text-accent tabular'
                        : 'text-ink-dim tabular'
                  }>
                    {item.anomaly_score.toFixed(4)}
                  </span>
                )}
                {visibleColumns.includes('Severity') && (
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
                )}
                {visibleColumns.includes('Primary Signal') && (
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
                )}
                {visibleColumns.includes('Detected') && (
                  <span className="text-ink-dim tabular text-[12px]">
                    {formatDt(item.detected_at, timezone)}
                  </span>
                )}
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
