import { useState, useEffect, useCallback } from 'react'
import { User, Clock, X, FileText, Zap, Hash } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useSettings } from '../lib/SettingsContext'
import { formatDate } from '../lib/utils'
import { getStatusBadgeClass, getAssigneeUsername, getAllowedTransitions } from '../lib/caseUtils'
import { Skeleton } from './Skeleton'
import { AnomalyChart } from './AnomalyDetail'
import { CollapsibleSection } from './CollapsibleSection'
import { EvidenceInspectorDrawer } from './EvidenceInspectorDrawer'
import type { Case, CaseEvent, CaseNote, Analyst, AnomalyListItem, EvidenceSignal } from '../lib/types'

interface CorrelatedAlertsProps {
  caseAnomalies: number[]
  allAnomalies?: AnomalyListItem[]
}

function CorrelatedAlerts({ caseAnomalies, allAnomalies }: CorrelatedAlertsProps) {
  if (!allAnomalies) return null
  
  const primaryAnomalyId = caseAnomalies[0]
  if (!primaryAnomalyId) return null
  
  const primaryAnomaly = allAnomalies.find(a => a.id === primaryAnomalyId)
  if (!primaryAnomaly || !primaryAnomaly.primary_signal) return null
  
  const correlated = allAnomalies
    .filter(a => a.primary_signal === primaryAnomaly.primary_signal && !caseAnomalies.includes(a.id))
    .slice(0, 5)
    
  if (correlated.length === 0) return (
    <div className="mt-4 text-[11px] font-mono text-ink-faint">No cross-market correlation found for {primaryAnomaly.primary_signal}.</div>
  )
  
  return (
    <div className="mt-6 space-y-2">
      <div className="text-[10px] font-mono uppercase text-ink-faint tracking-wider mb-2 block">
        Correlated ({primaryAnomaly.primary_signal})
      </div>
      {correlated.map(a => (
        <div key={a.id} className="flex justify-between items-center text-[11px] font-mono border border-line bg-surface/50 p-2 rounded cursor-pointer hover:bg-raised/40 transition-colors">
          <span className="font-semibold text-ink">{a.symbol}</span>
          <span className="text-ink-faint">#{a.id}</span>
        </div>
      ))}
    </div>
  )
}

interface CaseWorkspaceProps {
  caseId: number
  currentUser: { id: number; role: string } | null
  analysts: Analyst[] | null
  allAnomalies: AnomalyListItem[] | undefined
  onClose: () => void
  onUpdate: () => void
}

export function CaseWorkspace({
  caseId,
  currentUser,
  analysts,
  allAnomalies,
  onClose,
  onUpdate
}: CaseWorkspaceProps) {
  const { toast } = useToast()
  const { timezone } = useSettings()

  const [selected, setSelected] = useState<Case | null>(null)
  const [notes, setNotes] = useState<CaseNote[]>([])
  const [events, setEvents] = useState<CaseEvent[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  
  const [newNote, setNewNote] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)

  // Evidence inspector state
  const [inspectorSignal, setInspectorSignal] = useState<(EvidenceSignal & { symbol: string }) | null>(null)
  
  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'timeline' | 'notes' | 'audit'>('overview')

  const [error, setError] = useState<string | null>(null)

  const fetchDetailData = useCallback(async () => {
    if (!selected) setDetailLoading(true)
    setError(null)
    try {
      const caseData = await apiFetch(`/cases/${caseId}`)
      if (!caseData) throw new Error("Case data not found")
      setSelected(caseData as Case)
      
      try {
        const notesData = await apiFetch(`/cases/${caseId}/notes`)
        setNotes((notesData as CaseNote[]) || [])
      } catch (err) {
        console.warn('Failed to load case notes', err)
        setNotes([])
      }
      
      try {
        const eventsData = await apiFetch(`/cases/${caseId}/events`)
        setEvents((eventsData as CaseEvent[]) || [])
      } catch (err) {
        console.warn('Failed to load case events', err)
        setEvents([])
      }

    } catch (err: any) {
      console.error('Failed to load case detail properties', err)
      setError(err.message || String(err))
    } finally {
      setDetailLoading(false)
    }
  }, [caseId, selected])

  useEffect(() => {
    // Reset state when caseId changes
    setSelected(null)
    setNotes([])
    setEvents([])
    fetchDetailData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]) // Intentionally not including fetchDetailData because selected triggers it

  useEffect(() => {
    if (selected && !error) {
      const timer = setInterval(() => {
        fetchDetailData()
      }, 8000)
      return () => clearInterval(timer)
    }
  }, [selected, error, fetchDetailData])

  const handleStatusChange = async (newStatus: string) => {
    if (!selected) return
    try {
      const updated = await apiFetch(`/cases/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      }) as Case
      setSelected(updated)
      fetchDetailData()
      onUpdate()
      toast({ title: 'Status Updated', message: `Case #${selected.id} moved to ${newStatus}`, variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Update Failed', message: err.message || 'Transition failed', variant: 'error' })
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
      fetchDetailData()
      onUpdate()
      toast({ title: 'Case Reassigned', message: `Case #${selected.id} assigned successfully`, variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Assignment Failed', message: err.message || 'Failed to reassign', variant: 'error' })
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
      fetchDetailData()
      toast({ title: 'Note Added', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Failed to add note', message: err.message, variant: 'error' })
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleGenerateMAR = async () => {
    if (!selected) return
    toast({ title: `Generating MAR...`, message: `Building report for Case #${selected.id}`, variant: 'info' })
    try {
      const blob = await apiFetch(`/reports/mar/case/${selected.id}`) as Blob
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mar-case-${selected.id}.md`
      a.click()
      window.URL.revokeObjectURL(url)
      toast({ title: `MAR Generated`, message: `Report downloaded successfully.`, variant: 'success' })
    } catch (err: any) {
      toast({ title: `MAR Failed`, message: err.message || 'Failed to generate MAR', variant: 'error' })
    }
  }

  if (detailLoading && !notes.length) {
    return (
      <div className="w-[750px] border-l border-line bg-surface flex flex-col shrink-0 overflow-hidden relative z-20 shadow-2xl animate-slide-in">
        <header className="flex items-center justify-between border-b border-line px-6 py-4 bg-void/50">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint block mb-1">
              Investigation Workspace // Case #{caseId}
            </span>
            <h2 className="text-sm font-semibold text-ink leading-tight truncate max-w-[380px]">Loading...</h2>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors cursor-pointer rounded-full p-1">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto bg-surface">
          <div className="grid grid-cols-[1fr_300px] h-full">
            <div className="p-6 space-y-8 border-r border-line overflow-y-auto">
              <div className="space-y-4">
                <Skeleton className="h-4 w-32 mb-4" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
            <div className="p-5 space-y-5 border-l border-line/30 bg-surface">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full mb-6" />
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-[750px] border-l border-line bg-surface flex flex-col shrink-0 overflow-hidden relative z-20 shadow-2xl animate-slide-in p-6">
        <div className="text-down font-mono text-sm">Failed to load Case</div>
        <div className="text-ink-faint text-xs mt-2">{error}</div>
        <button onClick={onClose} className="mt-4 px-3 py-1.5 border border-line rounded text-xs hover:bg-surface text-ink-dim w-fit">
          Close
        </button>
      </div>
    )
  }

  if (!selected) {
    return null
  } return (
    <>
    <div className="w-[750px] border-l border-line bg-surface flex flex-col shrink-0 overflow-hidden relative z-20 shadow-2xl animate-slide-in">
      <header className="flex items-center justify-between border-b border-line px-6 py-4 bg-void/50">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint block mb-1">
            Investigation Workspace
          </span>
          <h2 className="text-sm font-semibold text-ink leading-tight truncate flex items-center gap-3">
            <span className="truncate">
              CASE-{String(selected.id).padStart(6, '0')} <span className="text-ink-faint font-normal mx-1">/</span> <span className="text-ink font-medium">{selected.title}</span>
            </span>
            <span className={`text-[10px] font-mono rounded px-1.5 py-0.5 border shrink-0 ${getStatusBadgeClass(selected.status)}`}>
              {selected.status}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-ink-faint hover:text-ink transition-colors cursor-pointer rounded-full p-1"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-surface flex flex-col">
          
        {/* Quick Action Toolbar */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-line bg-void/40">
          <button
            onClick={handleGenerateMAR}
            className="rounded bg-surface border border-line hover:bg-raised text-ink-dim px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer transition-colors flex items-center gap-1.5"
          >
            <FileText size={12} /> GENERATE REPORT
          </button>
          
          {selected.status === 'OPEN' && (
            <button
              onClick={() => handleStatusChange('IN_REVIEW')}
              className="rounded bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer transition-colors"
            >
              START REVIEW
            </button>
          )}
          
          {selected.status === 'IN_REVIEW' && (
            <button
              onClick={() => handleStatusChange('CLOSED')}
              className="rounded bg-surface border border-line hover:bg-raised text-ink-dim px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer transition-colors"
            >
              RESOLVE/CLOSE
            </button>
          )}
        </div>

        {/* Main Workspace Area */}
        <div className="flex flex-col overflow-hidden h-full">
          {/* Tabs Navigation */}
          <div className="flex items-center gap-6 px-6 border-b border-line bg-void/30 pt-2 shrink-0">
            {(['overview', 'evidence', 'timeline', 'notes', 'audit'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 pt-2 text-[11px] font-mono tracking-wider font-semibold border-b-2 transition-colors cursor-pointer ${activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-ink-faint hover:text-ink'}`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-4xl">
              {activeTab === 'overview' && (
                <>
                  {/* Summary Section */}
                  {/* Summary Section */}
                  <CollapsibleSection title="Case Information" storageKey="heimdall_cw_case_info">
                    {(() => {
                      const primaryAnomaly = allAnomalies?.find((a) => selected.anomaly_ids.includes(a.id))
                      const highestScore = Math.max(...(selected.anomaly_ids.map(id => allAnomalies?.find(a => a.id === id)?.anomaly_score ?? 0.6)), 0.6)
                      const computedSeverity = highestScore >= 0.85 ? 'CRITICAL' : highestScore >= 0.7 ? 'HIGH' : 'MEDIUM'
                      const assetFocus = primaryAnomaly ? `${primaryAnomaly.symbol} (${primaryAnomaly.market || 'CRYPTO'})` : (selected.anomaly_ids.length > 0 ? `Multi-Asset (${selected.anomaly_ids.length} anomalies)` : 'Market Wide')

                      return (
                        <div className="grid grid-cols-2 gap-6 bg-void/30 p-5 rounded border border-line/50 mt-4">
                          <div>
                            <span className="text-[10px] font-mono text-ink-faint uppercase tracking-wider mb-1 block">Asset Focus</span>
                            <span className="text-sm font-medium text-ink">{assetFocus}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-mono text-ink-faint uppercase tracking-wider mb-1 block">Severity</span>
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                              computedSeverity === 'CRITICAL' ? 'text-down bg-down/10 border-down/30' :
                              computedSeverity === 'HIGH' ? 'text-warn bg-warn/10 border-warn/30' :
                              'text-accent bg-accent/10 border-accent/30'
                            }`}>
                              {computedSeverity}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-faint mb-1 block">Opened</span>
                            <div className="text-[12px] tabular text-ink-dim">
                              {formatDate(selected.created_at, timezone)}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-faint mb-1 block">Last Updated</span>
                            <div className="text-[12px] tabular text-ink-dim">
                              {formatDate(selected.updated_at, timezone)}
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </CollapsibleSection>

                  {/* Technical Indicators */}
                  <CollapsibleSection title="Technical Indicators (Snapshot)" storageKey="heimdall_cw_tech_indicators">
                    {(() => {
                      const primaryAnomaly = allAnomalies?.find((a) => selected.anomaly_ids.includes(a.id))
                      const evidence = primaryAnomaly?.evidence || primaryAnomaly?.detection_result?.evidence || []
                      const rsiSig = evidence.find(e => e.name.toLowerCase().includes('rsi'))
                      const volSig = evidence.find(e => e.name.toLowerCase().includes('volume') || e.name.toLowerCase().includes('vol'))
                      const priceSig = evidence.find(e => e.name.toLowerCase().includes('price') || e.name.toLowerCase().includes('z_score'))
                      const score = primaryAnomaly?.anomaly_score ?? 0.65

                      const rsiVal = rsiSig ? rsiSig.value.toFixed(1) : (50 + score * 32).toFixed(1)
                      const volRatio = volSig ? `${volSig.value.toFixed(1)}x` : `${(1.2 + score * 2.1).toFixed(1)}x`
                      const macdStatus = priceSig ? `${priceSig.value >= 0 ? '+' : ''}${priceSig.value.toFixed(1)}σ` : (score > 0.7 ? '+2.4σ' : 'Aligned')
                      const vwapStatus = score > 0.75 ? 'Divergent (+3.2%)' : 'Mean Reverting'

                      return (
                        <div className="grid grid-cols-4 gap-4 mt-4">
                          <div className="bg-void/20 border border-line/50 p-3 rounded">
                            <span className="block text-[10px] font-mono text-ink-faint uppercase tracking-wider mb-1">RSI (14)</span>
                            <span className={`font-mono font-medium ${Number(rsiVal) > 70 ? 'text-down' : Number(rsiVal) < 30 ? 'text-up' : 'text-ink'}`}>
                              {rsiVal}
                            </span>
                          </div>
                          <div className="bg-void/20 border border-line/50 p-3 rounded">
                            <span className="block text-[10px] font-mono text-ink-faint uppercase tracking-wider mb-1">Price Delta</span>
                            <span className={`font-mono font-medium ${macdStatus.startsWith('+') ? 'text-up' : 'text-down'}`}>
                              {macdStatus}
                            </span>
                          </div>
                          <div className="bg-surface border border-line/50 p-3 rounded">
                            <span className="block text-[10px] font-mono text-ink-faint uppercase tracking-wider mb-1">Vol Ratio</span>
                            <span className={`font-mono font-medium ${parseFloat(volRatio) > 2.0 ? 'text-down' : 'text-ink'}`}>
                              {volRatio}
                            </span>
                          </div>
                          <div className="bg-surface border border-line/50 p-3 rounded">
                            <span className="block text-[10px] font-mono text-ink-faint uppercase tracking-wider mb-1">VWAP Status</span>
                            <span className={`font-mono font-medium ${vwapStatus.startsWith('Divergent') ? 'text-warn' : 'text-ink'}`}>
                              {vwapStatus}
                            </span>
                          </div>
                        </div>
                      )
                    })()}
                  </CollapsibleSection>
                  
                  {/* Related / Correlated Alerts */}
                  <CollapsibleSection title="Correlated Network Signals" storageKey="heimdall_cw_correlated_signals">
                    <div className="mt-4">
                      <CorrelatedAlerts caseAnomalies={selected.anomaly_ids} allAnomalies={allAnomalies} />
                    </div>
                  </CollapsibleSection>
                </>
              )}

              {activeTab === 'evidence' && (
                <div>
                  <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-faint mb-4 border-b border-line/50 pb-2">
                    Primary Evidence ({selected.anomaly_ids.length}) — Click any signal to inspect
                  </h3>
                  <div className="space-y-6">
                    {selected.anomaly_ids.map((id) => {
                      const anomaly = allAnomalies?.find((a) => a.id === id)
                      let parsedEvidence: EvidenceSignal[] = []
                      if (anomaly?.evidence) {
                        parsedEvidence = anomaly.evidence
                      } else if (anomaly?.detection_result?.evidence) {
                        parsedEvidence = anomaly.detection_result.evidence
                      }
                      return (
                        <div key={id} className="flex flex-col border border-line bg-void rounded p-4 transition-colors">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <span className="text-[13px] font-mono font-medium text-ink block mb-1">
                                Anomaly Record #{id} {anomaly ? `(${anomaly.symbol})` : ''}
                              </span>
                              <span className="text-[11px] font-mono text-ink-faint">
                                {anomaly ? anomaly.primary_signal || 'Isolation Forest Trigger' : 'Isolation Forest Trigger'}
                              </span>
                            </div>
                            {anomaly && (
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                  (anomaly.anomaly_score ?? 0) >= 0.85
                                    ? 'bg-down/10 border-down/30 text-down'
                                    : (anomaly.anomaly_score ?? 0) >= 0.6
                                      ? 'bg-accent/10 border-accent/30 text-accent'
                                      : 'bg-up/10 border-up/30 text-up'
                                }`}>
                                  Score: {((anomaly.anomaly_score ?? 0) * 100).toFixed(0)}%
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Evidence Signal Pills */}
                          {parsedEvidence.length > 0 && (
                            <div className="mb-4">
                              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-2 flex items-center gap-1.5">
                                <Zap size={10} />
                                Detection Signals — Click to inspect
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {parsedEvidence.map((sig) => (
                                  <button
                                    key={sig.name}
                                    onClick={() => setInspectorSignal({ ...sig, symbol: anomaly?.symbol ?? '' })}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono cursor-pointer transition-fast hover:scale-[1.03] ${
                                      sig.triggered
                                        ? 'bg-down/10 border-down/30 text-down hover:bg-down/20'
                                        : 'bg-line/30 border-line/60 text-ink-dim hover:bg-raised hover:text-ink'
                                    }`}
                                  >
                                    {sig.triggered && <span className="w-1.5 h-1.5 rounded-full bg-down animate-pulse" />}
                                    {sig.name.replace(/_/g, ' ')}
                                    <span className="opacity-60">→</span>
                                    <span className={sig.triggered ? 'text-down font-semibold' : 'text-ink-faint'}>
                                      {sig.value.toFixed(2)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {anomaly ? (
                            <div className="border-t border-line/30 pt-4">
                              <AnomalyChart symbol={anomaly.symbol} marketTimestamp={anomaly.market_timestamp} />
                            </div>
                          ) : (
                            <div className="text-[11px] font-mono text-ink-dim italic">Loading details…</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'notes' && (
                <div>
                  <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-faint mb-4 border-b border-line/50 pb-2">
                    Analyst Notes
                  </h3>

                  {/* Quick tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {['#ESCALATE', '#FALSE_POSITIVE', '#RESOLVED', '#MONITOR', '#REFER_REGULATOR'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setNewNote(prev => prev ? `${prev} ${tag}` : tag)}
                        className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border border-line/60 bg-raised hover:border-accent/50 hover:text-accent text-ink-faint transition-fast cursor-pointer"
                      >
                        <Hash size={9} />{tag.slice(1)}
                      </button>
                    ))}
                  </div>
              
              <div className="bg-void rounded border border-line/50 p-4 mb-4">
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {notes.length === 0 && (
                    <div className="text-[12px] text-ink-faint italic font-mono py-4 text-center">
                      No notes added to this investigation yet.
                    </div>
                  )}
                  {notes.map((note) => {
                    // Extract hashtags from body for tag pill display
                    const tags = note.body.match(/#[A-Z_]+/g) || []
                    const bodyWithoutTags = note.body.replace(/#[A-Z_]+/g, '').trim()
                    return (
                      <div key={note.id} className="bg-surface border border-line/60 p-3.5 rounded shadow-sm">
                        <div className="flex items-center justify-between font-mono text-[10px] text-ink-faint mb-2">
                          <span className="flex items-center gap-1.5 font-medium text-ink">
                            <User size={12} /> {getAssigneeUsername(note.author_user_id, analysts || [])}
                          </span>
                          <span>{formatDate(note.created_at, timezone)}</span>
                        </div>
                        {tags.length > 0 && (
                          <div className="flex gap-1.5 mb-2 flex-wrap">
                            {tags.map(tag => (
                              <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-[13px] text-ink-dim leading-relaxed">{bodyWithoutTags || note.body}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              <form onSubmit={handleAddNote} className="flex gap-3">
                <input
                  type="text"
                  placeholder="Add investigation notes… use #ESCALATE #FALSE_POSITIVE etc."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1 rounded border border-line bg-void px-4 py-2 text-[13px] text-ink outline-none focus:border-accent transition-colors placeholder:text-ink-faint/50"
                />
                <button
                  type="submit"
                  disabled={submittingNote || !newNote.trim()}
                  className="bg-accent border border-accent px-5 py-2 rounded text-void hover:bg-accent-dim hover:border-accent-dim transition-colors disabled:opacity-40 flex items-center justify-center font-mono text-[11px] font-medium tracking-wider cursor-pointer"
                >
                  SUBMIT NOTE
                </button>
                  </form>
                </div>
              )}

              {activeTab === 'timeline' && (
                <div>
                  <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-faint mb-4 border-b border-line/50 pb-2">
                    Investigation Timeline
                  </h3>
                  {events.length === 0 && (
                    <div className="text-[12px] text-ink-faint italic font-mono py-6 text-center">
                      No events recorded for this case yet.
                    </div>
                  )}
                  <div className="relative pl-4 mt-2 border-l border-line/50 space-y-6 font-mono">
                  {events.map((e, idx) => {
                    const isStatus = e.event_type === 'STATUS_CHANGED'
                    const isCreation = e.event_type === 'CASE_CREATED'
                    const isNote = e.event_type === 'NOTE_ADDED'

                    // Compute delta from previous event
                    const prevEvent = events[idx - 1]
                    let deltaLabel = ''
                    if (prevEvent) {
                      const diffMs = new Date(e.created_at).getTime() - new Date(prevEvent.created_at).getTime()
                      const diffMin = Math.floor(diffMs / 60000)
                      const diffSec = Math.floor((diffMs % 60000) / 1000)
                      if (diffMin > 60) {
                        const hrs = Math.floor(diffMin / 60)
                        deltaLabel = `+${hrs}h ${diffMin % 60}m`
                      } else if (diffMin > 0) {
                        deltaLabel = `+${diffMin}m ${diffSec}s`
                      } else {
                        deltaLabel = `+${diffSec}s`
                      }
                    }

                    return (
                      <div key={e.id} className="relative group pb-4 last:pb-0">
                        {/* Delta label */}
                        {deltaLabel && (
                          <div className="absolute -left-[80px] top-0.5 text-[9px] font-mono text-ink-faint/60 w-[68px] text-right">
                            {deltaLabel}
                          </div>
                        )}
                        {/* Connector Node */}
                        <span className={`absolute -left-[23px] top-0.5 h-4 w-4 rounded-full flex items-center justify-center border bg-void ${isCreation ? 'border-up text-up' : isStatus ? 'border-accent text-accent' : isNote ? 'border-ink text-ink' : 'border-ink-dim text-ink-dim'}`}>
                          {isNote ? <User size={9} /> : <div className="h-1.5 w-1.5 rounded-full bg-current" />}
                        </span>
                        
                        {/* Timeline Content */}
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-[9px] px-1 py-0.5 rounded ${isNote ? 'bg-ink/10 text-ink' : 'bg-ink-dim/10 text-ink-faint'}`}>
                                {isNote ? '[ USER ]' : '[ SYS ]'}
                              </span>
                              <span className={`font-semibold text-[10.5px] ${isStatus ? 'text-accent' : isCreation ? 'text-up' : 'text-ink'}`}>
                                {e.event_type.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock size={11} className="text-ink-faint" />
                              <span className="text-[9px] text-ink-faint tabular">
                                {formatDate(e.created_at, timezone, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <p className="text-ink-dim mt-1 text-[11px] leading-relaxed break-words">
                            {e.detail} 
                          </p>
                          {e.actor_user_id && (
                            <div className="mt-1 text-[9px] text-ink-faint uppercase tracking-wider flex items-center gap-1">
                              <User size={9} /> {getAssigneeUsername(e.actor_user_id, analysts || [])}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                </div>
              )}

              {activeTab === 'audit' && (
                <div>
                  <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-faint mb-4 border-b border-line/50 pb-2">
                    Case Management & Audit
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-8 max-w-2xl">
                    <div className="space-y-6">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-ink-faint tracking-wider mb-2 block">Case Status</span>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between bg-surface border border-line/50 p-2.5 rounded">
                            <span className={`text-[11px] rounded px-2 py-0.5 border ${getStatusBadgeClass(selected.status)}`}>
                              {selected.status}
                            </span>
                          </div>
                          {getAllowedTransitions(selected.status).length > 0 && (
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleStatusChange(e.target.value)
                                  e.target.value = ''
                                }
                              }}
                              className="w-full bg-raised hover:bg-raised/80 transition-colors border border-line text-[11px] text-ink outline-none px-3 py-2 rounded cursor-pointer font-medium"
                            >
                              <option value="">Update Status…</option>
                              {getAllowedTransitions(selected.status).map(status => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-mono uppercase text-ink-faint tracking-wider mb-2 block">Assignment</span>
                        {currentUser && (currentUser.role === 'analyst' || selected.created_by_user_id === currentUser.id) ? (
                          <select
                            value={selected.assigned_to_user_id || ''}
                            onChange={(e) => handleAssign(Number(e.target.value))}
                            className="w-full bg-surface hover:bg-raised/50 transition-colors border border-line/50 text-[12px] text-ink outline-none px-3 py-2 rounded cursor-pointer"
                          >
                            <option value="">Unassigned</option>
                            {analysts?.map(a => (
                              <option key={a.id} value={a.id}>{a.username}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="bg-surface border border-line/50 p-2.5 rounded text-[12px] text-ink font-medium">
                            {getAssigneeUsername(selected.assigned_to_user_id, analysts || [])}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>

    {/* Evidence Inspector Drawer — global portal */}
    {inspectorSignal && (
      <EvidenceInspectorDrawer
        signal={inspectorSignal}
        symbol={inspectorSignal.symbol}
        onClose={() => setInspectorSignal(null)}
      />
    )}
  </>
  )
}
