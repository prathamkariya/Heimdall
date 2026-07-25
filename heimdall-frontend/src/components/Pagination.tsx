/**
 * Reusable page-number pagination matching the AnomalyPaginatedResponse
 * contract (total, limit, offset). Renders page numbers, not "load more".
 */

interface PaginationProps {
  total: number
  limit: number
  offset: number
  onPageChange: (newOffset: number) => void
}

export function Pagination({ total, limit, offset, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.floor(offset / limit) + 1

  if (totalPages <= 1) return null

  // Show a window of page numbers around current
  const pages = buildPageWindow(currentPage, totalPages)

  return (
    <nav
      className="flex items-center justify-between border-t border-line px-5 py-3"
      aria-label="Pagination"
    >
      <span className="font-mono text-[11px] text-ink-faint">
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={currentPage === 1}
          className="rounded px-2 py-1 font-mono text-[11px] text-ink-dim transition-colors hover:bg-raised disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          ‹ PREV
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 font-mono text-[11px] text-ink-faint">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(((p as number) - 1) * limit)}
              className={`min-w-[28px] rounded px-1.5 py-1 font-mono text-[11px] transition-colors ${
                p === currentPage
                  ? 'bg-raised text-accent'
                  : 'text-ink-dim hover:bg-raised/60'
              }`}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(Math.min((totalPages - 1) * limit, offset + limit))}
          disabled={currentPage === totalPages}
          className="rounded px-2 py-1 font-mono text-[11px] text-ink-dim transition-colors hover:bg-raised disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          NEXT ›
        </button>
      </div>
    </nav>
  )
}

/** Build a window like [1, '...', 4, 5, 6, '...', 20] */
function buildPageWindow(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = []

  // Always show first page
  pages.push(1)

  if (current > 3) pages.push('...')

  // Window around current
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (current < total - 2) pages.push('...')

  // Always show last page
  pages.push(total)

  return pages
}
