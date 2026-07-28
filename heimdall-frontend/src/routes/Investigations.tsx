import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { useApiFetch } from '../lib/hooks'
import { Pagination } from '../components/Pagination'
import { 
  FolderGit, 
  User, 
  Clock, 
  Send, 
  X, 
  ChevronRight,
  FileText
} from 'lucide-react'

const PAGE_SIZE = 20

interface CaseEvent {
  id: number
  case_id: number
  actor_user_id: number | null
  event_type: string
  detail: string | null
  created_at: string
}

interface CaseNote {
  id: number
  case_id: number
  author_user_id: number
  body: string
  created_at: string
}

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

export function Investigations() {
  const [offset, setOffset] = useState(0)

  const { data, loading, error, execute: executeCases } = useApiFetch<CasePaginatedResponse>()
  const { data: currentUser, execute: executeCurrentUser } = useApiFetch<{ id: number; role: string }>()
  const { data: analysts, execute: executeAnalysts } = useApiFetch<Analyst[]>()

  // Detail panel state
  const [selected, setSelected] = useState<Case | null>(null)
  const [notes, setNotes] = useState<CaseNote[]>([])
  const [events, setEvents] = useState<CaseEvent[]>([])
  const [newNote, setNewNote] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchCurrentUser = useCallback(() => {
    executeCurrentUser('/auth/me')
  }, [executeCurrentUser])

  const fetchCases = useCallback(() => {
    executeCases(`/cases?limit=${PAGE_SIZE}&offset=${offset}`)
  }, [executeCases, offset])

  const fetchAnalysts = useCallback(() => {
    executeAnalysts('/cases/analysts')
  }, [executeAnalysts])

  const fetchDetailData = useCallback(async (caseId: number) => {
    setDetailLoading(true)
    try {
      const [caseData, notesData, eventsData] = await Promise.all([
        apiFetch(`/cases/${caseId}`),
        apiFetch(`/cases/${caseId}/notes`),
        apiFetch(`/cases/${caseId}/events`)
      ])
      setSelected(caseData as Case)
      setNotes(notesData as CaseNote[])
      setEvents(eventsData as CaseEvent[])
    } catch (err) {
      console.error('Failed to load case detail properties', err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCurrentUser()
    fetchAnalysts()
  }, [fetchCurrentUser, fetchAnalysts])

  useEffect(() => {
    fetchCases()
  }, [fetchCases])

  useEffect(() => {
    if (selected) {
      // Keep refresh loop or reload on selected ID change
      const timer = setInterval(() => {
        fetchDetailData(selected.id)
      }, 8000)
      return () => clearInterval(timer)
    }
  }, [selected, fetchDetailData])

  const handleStatusChange = async (newStatus: string) => {
    if (!selected) return
    try {
      const updated = await apiFetch(`/cases/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      }) as Case
      setSelected(updated)
      fetchDetailData(selected.id)
      fetchCases()
    } catch (err: any) {
      alert(err.message || 'Transition failed')
    }
  }

  const handleAssign = async (assigneeId: number) => {
    if (!selected) return
    try {
      const updated = await apiFetch(`/cases/${selected.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignee_user_id: assigneeId })
      }) as Case
      setSelected(updated)
      fetchDetailData(selected.id)
      fetchCases()
    } catch (err: any) {
      alert(err.message || 'Assignment failed')
    }
  }

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !newNote.trim() || submittingNote) return
    setSubmittingNote(true)
    try {
      await apiFetch(`/cases/${selected.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: newNote.trim() })
      })
      setNewNote('')
      fetchDetailData(selected.id)
    } catch (err: any) {
      alert(err.message || 'Failed to add note')
    } finally {
      setSubmittingNote(false)
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'text-down/70 bg-down/5 border-down/20 font-medium'
      case 'IN_REVIEW':
        return 'text-accent bg-accent/5 border-accent/20 font-medium'
      case 'ESCALATED':
        return 'text-down font-bold bg-down/10 border-down/30'
      case 'DISMISSED':
        return 'text-ink-faint bg-raised border-line line-through'
      case 'CLOSED':
        return 'text-up bg-up/5 border-up/20 font-medium'
      default:
        return 'text-ink-dim bg-raised border-line'
    }
  }

  // Get allowed transitions from current status
  const getAllowedTransitions = (status: string) => {
    switch (status) {
      case 'OPEN':
        return ['IN_REVIEW', 'DISMISSED', 'CLOSED']
      case 'IN_REVIEW':
        return ['OPEN', 'ESCALATED', 'DISMISSED', 'CLOSED']
      case 'ESCALATED':
        return ['IN_REVIEW', 'DISMISSED', 'CLOSED']
      case 'DISMISSED':
      case 'CLOSED':
        return ['OPEN']
      default:
        return []
    }
  }

  const getAssigneeUsername = (id: number | null) => {
    if (!id) return 'Unassigned'
    if (!analysts) return 'Loading...'
    const a = analysts.find(x => x.id === id)
    return a ? a.username : `User ${id}`
  }

  return (
    <div className="flex h-full select-none relative overflow-hidden bg-void">
      {/* List section */}
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

        {/* Column Headers */}
        <div className="grid grid-cols-[60px_1.5fr_100px_130px_1fr] gap-x-4 border-b border-line bg-surface px-5 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          <span>ID</span>
          <span>Case Title</span>
          <span>Status</span>
          <span>Assignee</span>
          <span>Created</span>
        </div>

        {/* Rows container */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-0.5 px-5 pt-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-raised/50" />
              ))}
            </div>
          )}

          {error && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-down">{error}</p>
              <button
                onClick={fetchCases}
                className="mt-3 font-mono text-[11px] text-accent hover:underline"
              >
                RETRY
              </button>
            </div>
          )}

          {!loading && !error && data && data.items.length === 0 && (
            <div className="flex h-32 items-center justify-center text-sm text-ink-faint font-mono">
              No investigations created yet.
            </div>
          )}

          {!loading && !error && data?.items.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelected(c)
                fetchDetailData(c.id)
              }}
              className={`grid w-full grid-cols-[60px_1.5fr_100px_130px_1fr] gap-x-4 border-b border-line/40 px-5 py-2.5 text-left font-mono text-[13px] transition-colors hover:bg-raised/40 ${
                selected?.id === c.id ? 'bg-raised/60' : ''
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
                {getAssigneeUsername(c.assigned_to_user_id)}
              </span>
              <span className="text-ink-faint text-[12px] tabular">
                {new Date(c.created_at).toLocaleString('en-GB', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                })}
              </span>
            </button>
          ))}
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

      {/* Detail sidebar */}
      {selected && (
        <div className="w-[500px] border-l border-line bg-surface/90 backdrop-blur flex flex-col shrink-0 overflow-hidden animate-slide-in relative z-20">
          <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-faint block mb-0.5">
                Case File #{selected.id}
              </span>
              <h2 className="text-sm font-semibold text-ink leading-tight truncate max-w-[380px]">{selected.title}</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  try {
                    const blob = await apiFetch(`/reports/mar/case/${selected.id}`) as Blob
                    const url = window.URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `mar-case-${selected.id}.md`
                    a.click()
                    window.URL.revokeObjectURL(url)
                  } catch (err: any) {
                    alert(err.message || 'Failed to generate MAR')
                  }
                }}
                className="bg-accent/10 text-accent border border-accent/20 hover:bg-accent hover:text-void transition-colors px-2.5 py-1 rounded font-mono text-[10px] uppercase flex items-center gap-1.5 cursor-pointer"
                title="Download Market Abuse Report (MAR) as Markdown"
              >
                <FileText size={12} /> Gen MAR
              </button>
              <button
                onClick={() => setSelected(null)}
                className="text-ink-faint hover:text-ink transition-colors cursor-pointer rounded-full p-1"
              >
                <X size={16} />
              </button>
            </div>
          </header>

          {detailLoading && !notes.length ? (
            <div className="flex-1 flex items-center justify-center">
              <Clock className="animate-spin text-accent" size={20} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Properties row */}
              <div className="grid grid-cols-2 gap-4 border border-line bg-void/35 p-4 rounded font-mono text-[11px]">
                <div>
                  <span className="text-ink-faint uppercase block text-[9px] mb-1">Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] rounded px-1.5 py-0.5 border ${getStatusBadgeClass(selected.status)}`}>
                      {selected.status}
                    </span>
                    {/* Transitions controls */}
                    {getAllowedTransitions(selected.status).length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleStatusChange(e.target.value)
                            e.target.value = ''
                          }
                        }}
                        className="bg-raised border border-line text-[10px] text-ink outline-none px-1 py-0.5 rounded cursor-pointer"
                      >
                        <option value="">Transition…</option>
                        {getAllowedTransitions(selected.status).map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-ink-faint uppercase block text-[9px] mb-1">Assignee</span>
                  {currentUser && (currentUser.role === 'analyst' || selected.created_by_user_id === currentUser.id) ? (
                    <select
                      value={selected.assigned_to_user_id || ''}
                      onChange={(e) => handleAssign(Number(e.target.value))}
                      className="bg-raised border border-line text-[11px] text-ink outline-none px-2 py-1 rounded w-full cursor-pointer"
                    >
                      <option value="">Unassigned</option>
                      {analysts?.map(a => (
                        <option key={a.id} value={a.id}>{a.username}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-ink font-medium">
                      {getAssigneeUsername(selected.assigned_to_user_id)}
                    </span>
                  )}
                </div>

                <div className="col-span-2 border-t border-line/50 pt-2 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-ink-faint uppercase block text-[9px] mb-0.5">Created At</span>
                    <span className="text-ink-dim tabular">
                      {new Date(selected.created_at).toLocaleString('en-GB')}
                    </span>
                  </div>
                  {selected.closed_at && (
                    <div>
                      <span className="text-ink-faint uppercase block text-[9px] mb-0.5">Closed At</span>
                      <span className="text-ink-dim tabular">
                        {new Date(selected.closed_at).toLocaleString('en-GB')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Linked Anomalies */}
              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2.5">
                  Linked Evidence ({selected.anomaly_ids.length})
                </h3>
                <div className="space-y-1.5">
                  {selected.anomaly_ids.map((id) => (
                    <div key={id} className="flex items-center justify-between border border-line bg-void/10 p-2.5 rounded text-[12px] font-mono">
                      <span>Anomaly Record #{id}</span>
                      <a
                        href={`/anomalies?id=${id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          window.location.href = `/anomalies?id=${id}`
                        }}
                        className="text-accent hover:underline flex items-center gap-0.5"
                      >
                        VIEW CHART <ChevronRight size={12} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>

              {/* Central Notes workflow */}
              <div className="border-t border-line pt-5">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-3">
                  Notes Timeline
                </h3>
                
                {/* Note inputs */}
                <form onSubmit={handleAddNote} className="mb-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add investigation logs…"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="flex-1 rounded border border-line bg-void/50 px-3 py-1.5 text-xs text-ink outline-none focus:border-accent transition-colors placeholder:text-ink-faint/50"
                    />
                    <button
                      type="submit"
                      disabled={submittingNote || !newNote.trim()}
                      className="bg-accent px-3 py-1.5 rounded text-void hover:bg-accent/90 transition-colors disabled:opacity-40 flex items-center justify-center cursor-pointer"
                    >
                      <Send size={12} />
                    </button>
                  </div>
                </form>

                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {notes.length === 0 && (
                    <div className="text-[11px] text-ink-faint italic font-mono py-2">
                      No investigation logs appended yet.
                    </div>
                  )}
                  {notes.map((note) => (
                    <div key={note.id} className="border border-line bg-void/35 p-3 rounded text-[12px]">
                      <div className="flex items-center justify-between font-mono text-[9px] text-ink-faint mb-1.5">
                        <span className="flex items-center gap-1">
                          <User size={10} /> {getAssigneeUsername(note.author_user_id)}
                        </span>
                        <span>{new Date(note.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-ink-dim leading-relaxed font-sans">{note.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Event audit trail timeline */}
              <div className="border-t border-line pt-5 pb-4">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-3.5">
                  Audit History timeline
                </h3>

                <div className="relative pl-4 border-l border-line space-y-4 font-mono text-[11px]">
                  {events.map((e) => (
                    <div key={e.id} className="relative">
                      {/* Icon point */}
                      <span className="absolute -left-[21px] top-0.5 bg-surface border border-line h-2.5 w-2.5 rounded-full flex items-center justify-center">
                        <span className="h-1 w-1 bg-accent rounded-full"></span>
                      </span>
                      <div className="flex items-center justify-between text-ink-dim mb-0.5">
                        <span className="font-bold text-[10px] tracking-wide text-ink border border-line/60 bg-raised px-1 rounded">
                          {e.event_type}
                        </span>
                        <span className="text-[9px] text-ink-faint">
                          {new Date(e.created_at).toLocaleString('en-GB', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          })}
                        </span>
                      </div>
                      <p className="text-ink-faint leading-relaxed text-[10.5px]">
                        {e.detail} {e.actor_user_id && `(by ${getAssigneeUsername(e.actor_user_id)})`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
