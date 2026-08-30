import { useState, useEffect, useCallback } from 'react'
import { FileText, Search, User, Download, Filter, X } from 'lucide-react'
import { useApiFetch } from '../lib/hooks'
import { EmptyState } from '../components/EmptyState'
import { Pagination } from '../components/Pagination'
import { Skeleton } from '../components/Skeleton'
import { useSettings } from '../lib/SettingsContext'
import { formatDate } from '../lib/utils'
import { useKeyboardNav } from '../lib/useKeyboardNav'
import { apiFetch } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { CaseWorkspace } from '../components/CaseWorkspace'

const PAGE_SIZE = 20

// Quick local types since we share some structure
interface Case {
  id: number
  created_by_user_id: number
  assigned_to_user_id: number | null
  title: string
  status: string
  anomaly_ids: number[]
  created_at: string
  updated_at: string
  closed_at: string | null
}

interface CasePaginatedResponse {
  items: Case[]
  total: number
  limit: number
  offset: number
}

interface Analyst {
  id: number
  email: string
  username: string
  role: string
}

function computeDuration(createdAt: string, closedAt: string | null, updatedAt: string): string {
  const start = new Date(createdAt).getTime()
  const end = new Date(closedAt || updatedAt).getTime()
  if (isNaN(start) || isNaN(end) || end <= start) return '< 1m'
  const diffMinutes = Math.round((end - start) / 60000)
  if (diffMinutes < 60) return `${diffMinutes}m`
  const hours = (diffMinutes / 60).toFixed(1)
  return `${hours}h`
}

function computeCaseRisk(anomalyIds: number[] | undefined, allAnomalies: any[] | undefined): { label: string; color: string } {
  if (!anomalyIds || anomalyIds.length === 0 || !allAnomalies) {
    return { label: 'LOW', color: 'text-ink-dim bg-raised border-line' }
  }
  const related = allAnomalies.filter(a => anomalyIds.includes(a.id))
  if (related.some(a => a.severity === 'CRITICAL' || (a.anomaly_score && a.anomaly_score >= 0.85))) {
    return { label: 'CRITICAL', color: 'text-down bg-down/10 border-down/30' }
  }
  if (related.some(a => a.severity === 'HIGH' || (a.anomaly_score && a.anomaly_score >= 0.70))) {
    return { label: 'HIGH', color: 'text-warn bg-warn/10 border-warn/30' }
  }
  if (related.some(a => a.severity === 'MEDIUM' || (a.anomaly_score && a.anomaly_score >= 0.50))) {
    return { label: 'MEDIUM', color: 'text-accent bg-accent/10 border-accent/30' }
  }
  return { label: 'LOW', color: 'text-ink-dim bg-raised border-line' }
}

export function Audit() {
  const { timezone } = useSettings()
  
  const [offset, setOffset] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null)
  
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [filterAssets, setFilterAssets] = useState<string[]>([])
  const [filterMarkets, setFilterMarkets] = useState<string[]>([])
  const [filterAnalysts, setFilterAnalysts] = useState<number[]>([])
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [filterDateRange, setFilterDateRange] = useState<{ start: string, end: string }>({ start: '', end: '' })
  
  const { data: casesData, loading, execute } = useApiFetch<CasePaginatedResponse>()
  const { data: analysts, execute: executeAnalysts } = useApiFetch<Analyst[]>()
  const { data: currentUser, execute: executeCurrentUser } = useApiFetch<{ id: number; role: string }>()
  const { data: anomaliesData, execute: executeAllAnomalies } = useApiFetch<any>()
  const { toast } = useToast()
  
  const fetchAnalysts = useCallback(() => {
    executeAnalysts('/cases/analysts')
  }, [executeAnalysts])

  const fetchClosedCases = useCallback(() => {
    // Some backends support ?status=CLOSED, some don't.
    // Assuming backend returns all if status unsupported, we'll filter below for MVP.
    execute(`/cases?limit=100&offset=0`)
  }, [execute])

  useEffect(() => {
    fetchAnalysts()
    fetchClosedCases()
    executeCurrentUser('/auth/me')
    executeAllAnomalies('/anomalies?limit=100')
  }, [fetchAnalysts, fetchClosedCases, executeCurrentUser, executeAllAnomalies])


  // Local filter for CLOSED/DISMISSED since MVP backend might lack the status query param
  const allClosedCases = (casesData?.items || []).filter(
    (c) => c.status === 'CLOSED' || c.status === 'DISMISSED'
  )

  const availableAssets = Array.from(new Set(anomaliesData?.items?.map((a: any) => a.symbol) || [])).filter(Boolean).sort() as string[]
  const availableMarkets = ['CRYPTO', 'US_EQUITY']
  const availableStatuses = ['CLOSED', 'DISMISSED']

  const filteredBySearch = allClosedCases.filter(c => {
    if (searchQuery) {
      const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) || c.id.toString() === searchQuery
      if (!matchesSearch) return false
    }

    if (filterStatuses.length > 0 && !filterStatuses.includes(c.status)) return false
    if (filterAnalysts.length > 0 && (c.assigned_to_user_id === null || !filterAnalysts.includes(c.assigned_to_user_id))) return false

    if (filterDateRange.start) {
      const closedDate = c.closed_at ? new Date(c.closed_at).getTime() : 0
      const start = new Date(filterDateRange.start).getTime()
      if (closedDate < start) return false
    }
    if (filterDateRange.end) {
      const closedDate = c.closed_at ? new Date(c.closed_at).getTime() : 0
      const end = new Date(filterDateRange.end).getTime() + 86400000 // end of day
      if (closedDate >= end) return false
    }

    if (filterAssets.length > 0 || filterMarkets.length > 0) {
      const caseAnomalies = anomaliesData?.items?.filter((a: any) => c.anomaly_ids.includes(a.id)) || []
      
      if (filterAssets.length > 0) {
        if (!caseAnomalies.some((a: any) => filterAssets.includes(a.symbol))) return false
      }
      
      if (filterMarkets.length > 0) {
        if (!caseAnomalies.some((a: any) => filterMarkets.includes(a.market))) return false
      }
    }

    return true
  })

  const paginatedCases = filteredBySearch.slice(offset, offset + PAGE_SIZE)
  const totalCases = filteredBySearch.length

  const getAssigneeUsername = (id: number | null) => {
    if (!id) return 'System'
    if (!analysts) return 'Loading...'
    const a = analysts.find(x => x.id === id)
    return a ? a.username : `User ${id}`
  }

  const { focusedIndex } = useKeyboardNav({
    itemCount: paginatedCases.length,
    onSelect: async (index) => {
      const c = paginatedCases[index]
      if (c) {
        toast({ title: `Viewing Audit for Case #${c.id}`, variant: 'info', duration: 2000 })
      }
    },
    isActive: true
  })

  const downloadMAR = async (caseId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    toast({ title: `Generating MAR...`, message: `Fetching historical report for Case #${caseId}`, variant: 'info' })
    try {
      const blob = await apiFetch(`/reports/mar/case/${caseId}`) as Blob
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `MAR_Case_${caseId}_${dateStr}.md`
      a.click()
      window.URL.revokeObjectURL(url)
      toast({ title: `MAR Generated`, message: `Report downloaded successfully.`, variant: 'success' })
    } catch (err: any) {
      toast({ title: `MAR Failed`, message: err.message || 'Failed to generate MAR', variant: 'error' })
    }
  }

  /** Export all filtered closed cases as a SHA-256 verified CSV audit package. */
  const exportAuditCSV = async () => {
    if (filteredBySearch.length === 0) {
      toast({ title: 'No Records', message: 'No archived cases to export.', variant: 'info' })
      return
    }

    const rows: string[][] = [
      ['Case ID', 'Title', 'Status', 'Assignee', 'Anomaly Count', 'Created At', 'Closed At', 'Duration (h)'],
    ]

    for (const c of filteredBySearch) {
      const assignee = getAssigneeUsername(c.assigned_to_user_id)
      const anomalyCount = c.anomaly_ids?.length ?? 0
      let durationH = '-'
      if (c.created_at && c.closed_at) {
        const ms = new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()
        durationH = (ms / 3_600_000).toFixed(2)
      }
      rows.push([
        String(c.id),
        c.title,
        c.status,
        assignee,
        String(anomalyCount),
        c.created_at,
        c.closed_at ?? '-',
        durationH,
      ])
    }

    const csvContent = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')

    // SHA-256 integrity checksum
    const msgBuffer = new TextEncoder().encode(csvContent)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const exportContent = `${csvContent}\n\n# HEIMDALL Audit Export — ${new Date().toISOString()}\n# SHA-256: ${hashHex}\n# Records: ${filteredBySearch.length}`

    const blob = new Blob([exportContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `HEIMDALL_Audit_${dateStr}_${hashHex.slice(0, 8)}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    toast({
      title: 'Audit CSV Exported',
      message: `${filteredBySearch.length} records · SHA-256: ${hashHex.slice(0, 16)}…`,
      variant: 'success',
    })
  }

  // Allow CommandPalette to remotely trigger CSV export from any route
  useEffect(() => {
    const handler = () => { exportAuditCSV() }
    window.addEventListener('trigger_audit_export', handler)
    return () => window.removeEventListener('trigger_audit_export', handler)
  // exportAuditCSV captures allClosedCases and analysts via closure;
  // re-register whenever those stabilize.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casesData, analysts])

  return (
    <div className="flex h-full w-full select-none overflow-hidden bg-void">
      <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <h1 className="text-sm font-medium text-ink flex items-center gap-2">
            <FileText size={16} className="text-ink-dim" />
            Audit & Reports
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-[10px] font-mono text-ink-faint">
              Historical investigation archive and Market Abuse Reports (MAR)
            </p>
            <span className="font-mono text-[10px] text-ink-faint border-l border-line pl-3">
              {totalCases || 0} RECORD{totalCases !== 1 && 'S'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input 
              type="text" 
              placeholder="Search historical cases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-surface border border-line pl-8 pr-3 py-1.5 rounded text-[11px] font-mono text-ink outline-none focus:border-accent w-64 placeholder:text-ink-faint/50 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center gap-1.5 border px-3 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
              showFilterPanel || filterAssets.length > 0 || filterMarkets.length > 0 || filterAnalysts.length > 0 || filterStatuses.length > 0 || filterDateRange.start || filterDateRange.end
                ? 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/20' 
                : 'bg-surface border-line text-ink-dim hover:text-ink hover:bg-raised'
            }`}
          >
            <Filter size={12} />
            Filters
            {(filterAssets.length > 0 || filterMarkets.length > 0 || filterAnalysts.length > 0 || filterStatuses.length > 0 || filterDateRange.start || filterDateRange.end) && (
              <span className="ml-1 bg-accent text-void rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
                {filterAssets.length + filterMarkets.length + filterAnalysts.length + filterStatuses.length + (filterDateRange.start ? 1 : 0) + (filterDateRange.end ? 1 : 0)}
              </span>
            )}
          </button>
          <button
            onClick={exportAuditCSV}
            title="Export verified CSV audit package with SHA-256 checksum"
            className="flex items-center gap-1.5 border border-line bg-surface hover:bg-raised hover:border-accent/50 text-ink-dim hover:text-ink px-3 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
          >
            <Download size={12} />
            Export CSV
          </button>
        </div>
      </header>

      {/* Advanced Filter Panel */}
      {showFilterPanel && (
        <div className="bg-surface border-b border-line px-5 py-4 animate-slide-in">
          <div className="flex items-start justify-between mb-4">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
              <Filter size={12} /> Advanced Filters
            </h3>
            <button 
              onClick={() => {
                setFilterAssets([])
                setFilterMarkets([])
                setFilterAnalysts([])
                setFilterStatuses([])
                setFilterDateRange({ start: '', end: '' })
              }}
              className="text-[10px] font-mono text-ink-faint hover:text-accent flex items-center gap-1 transition-colors cursor-pointer"
            >
              <X size={10} /> CLEAR ALL
            </button>
          </div>
          
          <div className="grid grid-cols-5 gap-6">
            <div>
              <label className="block text-[10px] font-mono text-ink-dim mb-2">ASSETS</label>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                {availableAssets.map(asset => (
                  <label key={asset} className="flex items-center gap-2 text-[11px] font-mono text-ink cursor-pointer hover:bg-raised/50 px-1 py-0.5 rounded">
                    <input 
                      type="checkbox" 
                      checked={filterAssets.includes(asset)}
                      onChange={(e) => {
                        if (e.target.checked) setFilterAssets([...filterAssets, asset])
                        else setFilterAssets(filterAssets.filter(a => a !== asset))
                      }}
                      className="accent-accent"
                    />
                    {asset}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-ink-dim mb-2">MARKETS</label>
              <div className="space-y-1">
                {availableMarkets.map(market => (
                  <label key={market} className="flex items-center gap-2 text-[11px] font-mono text-ink cursor-pointer hover:bg-raised/50 px-1 py-0.5 rounded">
                    <input 
                      type="checkbox" 
                      checked={filterMarkets.includes(market)}
                      onChange={(e) => {
                        if (e.target.checked) setFilterMarkets([...filterMarkets, market])
                        else setFilterMarkets(filterMarkets.filter(m => m !== market))
                      }}
                      className="accent-accent"
                    />
                    {market}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-ink-dim mb-2">ANALYST</label>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                {analysts?.map(analyst => (
                  <label key={analyst.id} className="flex items-center gap-2 text-[11px] font-mono text-ink cursor-pointer hover:bg-raised/50 px-1 py-0.5 rounded">
                    <input 
                      type="checkbox" 
                      checked={filterAnalysts.includes(analyst.id)}
                      onChange={(e) => {
                        if (e.target.checked) setFilterAnalysts([...filterAnalysts, analyst.id])
                        else setFilterAnalysts(filterAnalysts.filter(a => a !== analyst.id))
                      }}
                      className="accent-accent"
                    />
                    {analyst.username}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-ink-dim mb-2">STATUS</label>
              <div className="space-y-1">
                {availableStatuses.map(status => (
                  <label key={status} className="flex items-center gap-2 text-[11px] font-mono text-ink cursor-pointer hover:bg-raised/50 px-1 py-0.5 rounded">
                    <input 
                      type="checkbox" 
                      checked={filterStatuses.includes(status)}
                      onChange={(e) => {
                        if (e.target.checked) setFilterStatuses([...filterStatuses, status])
                        else setFilterStatuses(filterStatuses.filter(s => s !== status))
                      }}
                      className="accent-accent"
                    />
                    {status}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-ink-dim mb-2">DATE RANGE (CLOSED)</label>
              <div className="space-y-2">
                <div>
                  <span className="text-[9px] text-ink-faint block mb-0.5">FROM</span>
                  <input 
                    type="date" 
                    value={filterDateRange.start}
                    onChange={e => setFilterDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="w-full bg-void border border-line px-2 py-1 rounded text-[11px] text-ink font-mono outline-none focus:border-accent [color-scheme:dark]"
                  />
                </div>
                <div>
                  <span className="text-[9px] text-ink-faint block mb-0.5">TO</span>
                  <input 
                    type="date" 
                    value={filterDateRange.end}
                    onChange={e => setFilterDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="w-full bg-void border border-line px-2 py-1 rounded text-[11px] text-ink font-mono outline-none focus:border-accent [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Column Headers */}
      <div className="grid grid-cols-[80px_1.5fr_100px_80px_90px_120px_120px_100px] gap-x-4 border-b border-line bg-surface px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint select-none">
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Case ID <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Case Title <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Final Status <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Risk <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Duration <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Closed Date <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Closing Analyst <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="text-right">Actions</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-0.5 pt-2">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="grid w-full grid-cols-[80px_1.5fr_100px_80px_90px_120px_120px_100px] items-center gap-x-4 border-b border-line/40 px-4 py-1.5">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
                <div className="text-right"><Skeleton className="h-6 w-20 inline-block rounded" /></div>
              </div>
            ))}
          </div>
        )}

        {!loading && totalCases === 0 && (
          <EmptyState 
            title="Awaiting archival data"
            description="No historical or dismissed cases match your current filters."
            icon="database"
          />
        )}

        {!loading && paginatedCases.map((c, index) => {
          const isFocused = index === focusedIndex
          return (
            <div
              key={c.id}
              onClick={() => setSelectedCaseId(c.id)}
              className={`cursor-pointer grid w-full grid-cols-[80px_1.5fr_100px_80px_90px_120px_120px_100px] items-center gap-x-4 border-b border-line/40 px-4 py-1.5 text-left font-mono text-[13px] transition-all hover:bg-raised/60 ${
                selectedCaseId === c.id 
                  ? 'bg-selected border-l-2 border-l-accent' 
                  : isFocused 
                    ? 'bg-raised/30 border-l-2 border-l-line' 
                    : 'border-l-2 border-l-transparent'
              }`}
            >
              <span className="text-ink-faint tabular">#{c.id}</span>
              <span className="font-medium text-ink truncate pr-4">{c.title}</span>
              <span>
                <span className={`text-[10px] rounded px-1.5 py-0.5 border ${
                  c.status === 'CLOSED' ? 'text-up bg-up/5 border-up/20' : 'text-ink-faint bg-raised border-line line-through'
                }`}>
                  {c.status}
                </span>
              </span>
              {/* Real Computed Risk */}
              <span>
                {(() => {
                  const risk = computeCaseRisk(c.anomaly_ids, anomaliesData?.items)
                  return (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${risk.color}`}>
                      {risk.label}
                    </span>
                  )
                })()}
              </span>
              {/* Real Computed Duration */}
              <span className="text-[11px] tabular text-ink-dim font-mono">
                {computeDuration(c.created_at, c.closed_at, c.updated_at)}
              </span>
              <span className="text-ink-dim text-[12px] tabular">
                {c.closed_at ? formatDate(c.closed_at, timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
              </span>
              <span className="text-ink-dim truncate flex items-center gap-1">
                <User size={12} className="opacity-50" />
                {getAssigneeUsername(c.assigned_to_user_id)}
              </span>
              <div className="text-right">
                <button
                  onClick={(e) => downloadMAR(c.id, e)}
                  className="bg-accent/10 text-accent border border-accent/20 hover:bg-accent hover:text-void transition-colors px-2 py-1 rounded font-mono text-[9px] uppercase inline-flex items-center gap-1 cursor-pointer"
                >
                  <FileText size={10} /> Export Report
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <Pagination
        total={totalCases}
        limit={PAGE_SIZE}
        offset={offset}
        onPageChange={setOffset}
      />
      </div>

      {selectedCaseId && (
        <CaseWorkspace
          caseId={selectedCaseId}
          currentUser={currentUser}
          analysts={analysts}
          allAnomalies={anomaliesData?.items}
          onClose={() => setSelectedCaseId(null)}
          onUpdate={fetchClosedCases}
        />
      )}
    </div>
  )
}
