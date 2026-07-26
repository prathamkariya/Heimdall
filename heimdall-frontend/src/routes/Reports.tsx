import { useState } from 'react'
import { FileText, Loader2, AlertTriangle, ChevronRight, Download, Eye, FileSpreadsheet } from 'lucide-react'
import { getAccessToken } from '../lib/api'

const BASE_URL = '/api/v1'

type ReportType = 'mar' | 'daily' | 'weekly' | 'export' | 'compliance'

export function Reports() {
  const [selectedType, setSelectedType] = useState<ReportType>('mar')
  const [caseId, setCaseId] = useState('')
  const [report, setReport] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mock template variables
  const [dateRange, setDateRange] = useState('2026-07-25')

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = caseId.trim()
    if (!id) return

    setLoading(true)
    setError(null)
    setReport(null)

    try {
      const token = getAccessToken()
      const res = await fetch(`${BASE_URL}/reports/mar/case/${encodeURIComponent(id)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) {
        let detail = 'Failed to generate report'
        try {
          const errBody = await res.json()
          detail = errBody.detail || detail
        } catch {
          detail = await res.text() || detail
        }
        throw new Error(detail)
      }

      const markdown = await res.text()
      setReport(markdown)
    } catch (err: any) {
      setError(err?.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full select-none">
      {/* Sidebar for Report Templates */}
      <div className="w-72 shrink-0 border-r border-line bg-surface flex flex-col">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <FileText size={15} strokeWidth={1.75} className="text-ink-faint" />
          <h1 className="text-sm font-medium text-ink">Investigation Templates</h1>
        </header>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Daily Summary */}
          <button
            onClick={() => { setSelectedType('daily'); setReport(null); setError(null); }}
            className={`w-full text-left px-4 py-3 border-b border-line/40 flex items-start gap-2.5 transition-colors cursor-pointer ${
              selectedType === 'daily' ? 'bg-raised text-ink' : 'text-ink-dim hover:bg-raised/30'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold">Daily Summary</div>
              <div className="text-[10px] text-ink-faint mt-0.5">Muted market-wide activity log over the last 24h.</div>
            </div>
            <ChevronRight size={14} className="text-ink-faint mt-0.5" />
          </button>

          {/* Weekly Summary */}
          <button
            onClick={() => { setSelectedType('weekly'); setReport(null); setError(null); }}
            className={`w-full text-left px-4 py-3 border-b border-line/40 flex items-start gap-2.5 transition-colors cursor-pointer ${
              selectedType === 'weekly' ? 'bg-raised text-ink' : 'text-ink-dim hover:bg-raised/30'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold">Weekly Summary</div>
              <div className="text-[10px] text-ink-faint mt-0.5">Aggregate scores, models drift, and flagged symbols.</div>
            </div>
            <ChevronRight size={14} className="text-ink-faint mt-0.5" />
          </button>

          {/* Incident Report (MAR) */}
          <button
            onClick={() => { setSelectedType('mar'); setReport(null); setError(null); }}
            className={`w-full text-left px-4 py-3 border-b border-line/40 flex items-start gap-2.5 transition-colors cursor-pointer ${
              selectedType === 'mar' ? 'bg-raised text-ink' : 'text-ink-dim hover:bg-raised/30'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold">Incident Report (MAR)</div>
              <div className="text-[10px] text-ink-faint mt-0.5">Detailed abuse regulation timeline of a Case investigation.</div>
            </div>
            <ChevronRight size={14} className="text-ink-faint mt-0.5" />
          </button>

          {/* Export Investigation */}
          <button
            onClick={() => { setSelectedType('export'); setReport(null); setError(null); }}
            className={`w-full text-left px-4 py-3 border-b border-line/40 flex items-start gap-2.5 transition-colors cursor-pointer ${
              selectedType === 'export' ? 'bg-raised text-ink' : 'text-ink-dim hover:bg-raised/30'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold">Export Case Data</div>
              <div className="text-[10px] text-ink-faint mt-0.5">Compile case timeline logs in raw compliance formats.</div>
            </div>
            <ChevronRight size={14} className="text-ink-faint mt-0.5" />
          </button>

          {/* Compliance Report */}
          <button
            onClick={() => { setSelectedType('compliance'); setReport(null); setError(null); }}
            className={`w-full text-left px-4 py-3 border-b border-line flex items-start gap-2.5 transition-colors cursor-pointer ${
              selectedType === 'compliance' ? 'bg-raised text-ink' : 'text-ink-dim hover:bg-raised/30'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold">Compliance Audit</div>
              <div className="text-[10px] text-ink-faint mt-0.5">Standardized compliance logs with digital signature.</div>
            </div>
            <ChevronRight size={14} className="text-ink-faint mt-0.5" />
          </button>
        </div>
      </div>

      {/* Main Workspace Preview Pane */}
      <div className="flex-1 flex flex-col bg-void">
        {selectedType === 'mar' && (
          <>
            <header className="flex items-center justify-between border-b border-line px-5 py-3 bg-surface">
              <h2 className="text-sm font-medium text-ink">Incident Report Generator (MAR)</h2>
            </header>

            <div className="border-b border-line px-5 py-4 bg-surface/30">
              <p className="mb-3 text-[12px] text-ink-dim leading-relaxed">
                Generate an AI-driven Market Abuse Regulation (MAR) report for a specific investigation Case.
                The generator calls Gemini to outline the timeline and suspicious flags from all linked anomalies.
              </p>

              <form onSubmit={handleGenerate} className="flex items-end gap-3">
                <div className="flex-1 max-w-[200px]">
                  <label htmlFor="case-id" className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider text-ink-faint">
                    Case ID
                  </label>
                  <input
                    id="case-id"
                    type="number"
                    min={1}
                    required
                    placeholder="e.g. 42"
                    value={caseId}
                    onChange={(e) => setCaseId(e.target.value)}
                    className="w-full border border-line bg-raised px-3 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !caseId.trim()}
                  className="flex items-center gap-2 rounded bg-line px-4 py-1.5 font-mono text-[11px] font-medium text-ink transition-colors hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      GENERATING…
                    </>
                  ) : (
                    'RUN GENERATOR'
                  )}
                </button>
              </form>
            </div>

            {error && (
              <div className="flex items-center gap-2 border-b border-down/20 bg-down-dim/10 px-5 py-3">
                <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 text-down" />
                <span className="text-[13px] text-down">{error}</span>
              </div>
            )}

            {loading && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <Loader2 size={24} className="animate-spin text-accent" />
                <p className="font-mono text-[11px] text-ink-faint">Generating MAR report via Gemini…</p>
                <p className="font-mono text-[10px] text-ink-faint">This may take 10–30 seconds</p>
              </div>
            )}

            {!loading && report && (
              <div className="flex-1 overflow-y-auto px-5 py-6">
                <div className="mx-auto max-w-3xl">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                      MAR Report — Case #{caseId}
                    </span>
                    <button
                      onClick={() => {
                        const blob = new Blob([report], { type: 'text/markdown' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `MAR_Case_${caseId}.md`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="font-mono text-[10px] text-accent hover:underline flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download size={12} /> DOWNLOAD MD
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink-dim p-4 border border-line bg-surface rounded">
                    {report}
                  </pre>
                </div>
              </div>
            )}

            {!loading && !report && !error && (
              <div className="flex flex-1 flex-col items-center justify-center">
                <FileText size={24} strokeWidth={1.5} className="mb-2 text-ink-faint" />
                <p className="text-[12px] text-ink-faint font-mono">Select or enter a Case ID above to compile incident logs</p>
              </div>
            )}
          </>
        )}

        {selectedType !== 'mar' && (
          <>
            <header className="flex items-center justify-between border-b border-line px-5 py-3 bg-surface">
              <h2 className="text-sm font-medium text-ink">
                {selectedType === 'daily' ? 'Daily Summary Template' :
                 selectedType === 'weekly' ? 'Weekly Summary Template' :
                 selectedType === 'export' ? 'Export Case Logs' :
                 'Compliance Audit logs'}
              </h2>
            </header>

            <div className="flex-1 flex flex-col p-6 items-center justify-center text-center font-mono max-w-md mx-auto">
              <FileSpreadsheet size={32} className="text-accent mb-3" strokeWidth={1.5} />
              <h3 className="text-sm font-semibold text-ink uppercase mb-2">Automated Compliance Template</h3>
              <p className="text-[11px] text-ink-dim leading-relaxed mb-4">
                This compliance script builds a formatted, digitalized compliance-ready artifact compiling surveillance outputs.
              </p>

              <div className="w-full space-y-3 text-left border border-line bg-surface p-4 rounded mb-5">
                <div>
                  <label className="block text-[9px] text-ink-faint uppercase mb-1">DATE PARAMETER</label>
                  <input
                    type="date"
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink font-mono outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <span className="block text-[9px] text-ink-faint uppercase mb-1">Export Format</span>
                  <span className="text-[12px] text-ink font-semibold">CSV / PDF compliance-envelope (.zip)</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button className="flex items-center gap-2 rounded bg-accent text-void hover:bg-accent/90 px-4 py-2 text-[10px] font-semibold tracking-wider font-mono cursor-pointer">
                  <Eye size={12} /> PREVIEW ENVELOPE
                </button>
                <button className="flex items-center gap-2 rounded bg-line border border-line hover:bg-raised text-ink px-4 py-2 text-[10px] font-semibold tracking-wider font-mono cursor-pointer">
                  <Download size={12} /> COMPILE & EXPORT
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
