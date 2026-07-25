import { useState } from 'react'
import { FileText, Loader2, AlertTriangle } from 'lucide-react'
import { getAccessToken } from '../lib/api'

const BASE_URL = '/api/v1'

export function Reports() {
  const [alertId, setAlertId] = useState('')
  const [report, setReport] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = alertId.trim()
    if (!id) return

    setLoading(true)
    setError(null)
    setReport(null)

    try {
      // This endpoint returns text/markdown, not JSON — use raw fetch
      // so we can read the response as text and display the server's
      // error detail on 403/404/503 instead of a generic fetch error.
      const token = getTokenFromContext()
      const res = await fetch(`${BASE_URL}/reports/mar/${encodeURIComponent(id)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) {
        let detail = 'Failed to generate report'
        try {
          // Error responses from FastAPI are JSON even when the success response is plaintext
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-line px-5 py-3">
        <FileText size={15} strokeWidth={1.75} className="text-ink-faint" />
        <h1 className="text-sm font-medium text-ink">MAR Report Generator</h1>
      </header>

      {/* Input form */}
      <div className="border-b border-line px-5 py-4">
        <p className="mb-3 text-[12px] text-ink-dim leading-relaxed">
          Generate a Market Abuse Regulation (MAR) report for a detected anomaly.
          This calls an AI model (Gemini) — expect a few seconds of latency.
          You can only generate reports for anomalies you own or system-detected anomalies.
        </p>

        <form onSubmit={handleGenerate} className="flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="alert-id"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-faint"
            >
              Anomaly / Alert ID
            </label>
            <input
              id="alert-id"
              type="number"
              min={1}
              required
              placeholder="e.g. 42"
              value={alertId}
              onChange={(e) => setAlertId(e.target.value)}
              className="w-full max-w-[200px] border border-line bg-raised px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !alertId.trim()}
            className="flex items-center gap-2 rounded bg-line px-5 py-2 font-mono text-[11px] font-medium text-ink transition-colors hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                GENERATING…
              </>
            ) : (
              'GENERATE REPORT'
            )}
          </button>
        </form>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 border-b border-down/20 bg-down-dim/10 px-5 py-3">
          <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 text-down" />
          <span className="text-[13px] text-down">{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 size={24} className="animate-spin text-accent" />
          <p className="font-mono text-[11px] text-ink-faint">
            Generating MAR report via Gemini…
          </p>
          <p className="font-mono text-[10px] text-ink-faint">
            This may take 10–30 seconds
          </p>
        </div>
      )}

      {/* Report content */}
      {!loading && report && (
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                MAR Report — Alert #{alertId}
              </span>
              <button
                onClick={() => {
                  const blob = new Blob([report], { type: 'text/markdown' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `MAR_Alert_${alertId}.md`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="font-mono text-[10px] text-accent hover:underline"
              >
                DOWNLOAD .MD
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink-dim">
              {report}
            </pre>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !report && !error && (
        <div className="flex flex-1 flex-col items-center justify-center">
          <FileText size={28} strokeWidth={1} className="mb-3 text-ink-faint" />
          <p className="text-sm text-ink-faint">Enter an anomaly ID and generate a report</p>
        </div>
      )}
    </div>
  )
}

/**
 * Uses the module-level getter exported by api.ts to get the current token.
 */
function getTokenFromContext(): string {
  return getAccessToken()
}
