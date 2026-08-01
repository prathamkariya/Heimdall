import { FolderGit } from 'lucide-react'
import { Pagination } from './Pagination'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'
import { formatDate } from '../lib/utils'
import { getStatusBadgeClass, getAssigneeUsername } from '../lib/caseUtils'
import { useSettings } from '../lib/SettingsContext'
import type { CasePaginatedResponse, Analyst } from '../lib/types'

interface CaseListProps {
  data: CasePaginatedResponse | null
  loading: boolean
  error: Error | any
  selectedId: number | null
  focusedIndex: number
  analysts: Analyst[] | null
  onSelect: (id: number) => void
  onRetry: () => void
  setOffset: (offset: number) => void
}

export function CaseList({
  data,
  loading,
  error,
  selectedId,
  focusedIndex,
  analysts,
  onSelect,
  onRetry,
  setOffset
}: CaseListProps) {
  const { timezone } = useSettings()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-line px-5 py-3 bg-void">
        <h1 className="text-sm font-medium text-ink flex items-center gap-2">
          <FolderGit size={16} className="text-accent" />
          Investigations
        </h1>
        <div className="font-mono text-[10px] text-ink-faint">
          {data?.total || 0} ACTIVE CASE{data?.total !== 1 && 'S'}
        </div>
      </header>

      {/* Column headers */}
      <div className="grid grid-cols-[45px_1fr_85px_110px_90px] gap-x-3 border-b border-line bg-surface px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint select-none">
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">ID <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Case Title <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Status <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Assignee <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
        <span className="group flex items-center gap-1 cursor-pointer hover:text-ink transition-colors w-fit">Created <span className="opacity-0 group-hover:opacity-100 text-[8px] text-accent transition-opacity">↓</span></span>
      </div>

      {/* Rows container */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-0.5 pt-2">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="grid w-full grid-cols-[45px_1fr_85px_110px_90px] gap-x-3 border-b border-line/40 px-4 py-2.5 items-center">
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-14 rounded" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-down">{error.message || String(error)}</p>
            <button
              onClick={onRetry}
              className="mt-3 font-mono text-[11px] text-accent hover:underline"
            >
              RETRY
            </button>
          </div>
        )}

        {!loading && !error && data && data.items.length === 0 && (
          <EmptyState 
            title="No investigations currently assigned"
            description="Escalate an anomaly to begin a new investigation."
            icon="database"
          />
        )}

        {!loading && !error && data?.items.map((c, index) => {
          const isFocused = index === focusedIndex
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`grid w-full grid-cols-[45px_1fr_85px_110px_90px] gap-x-3 border-b border-line/40 px-4 py-2 text-left font-mono text-[13px] transition-fast hover:bg-raised/60 ${
                selectedId === c.id 
                  ? 'bg-selected border-l-2 border-l-accent' 
                  : isFocused 
                    ? 'bg-raised/30 border-l-2 border-l-line' 
                    : 'border-l-2 border-l-transparent'
              }`}
            >
              <span className="text-ink-faint tabular">{c.id}</span>
              <span className="font-medium text-ink truncate pr-4">{c.title}</span>
              <span>
                <span className={`text-[10px] rounded px-1.5 py-0.5 border ${getStatusBadgeClass(c.status)}`}>
                  {c.status}
                </span>
              </span>
              <span className="text-ink-dim truncate">
                {getAssigneeUsername(c.assigned_to_user_id, analysts || [])}
              </span>
              <span className="text-ink-faint text-[12px] tabular">
                {formatDate(c.created_at, timezone, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          )
        })}
      </div>

      {/* Pagination footer */}
      {data && (
        <Pagination
          total={data.total}
          limit={data.limit}
          offset={data.offset}
          onPageChange={setOffset}
        />
      )}
    </div>
  )
}
