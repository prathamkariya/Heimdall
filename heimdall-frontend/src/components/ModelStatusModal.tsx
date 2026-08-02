import { useState, useEffect } from 'react'
import { X, Cpu, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Layers, ShieldCheck, Database } from 'lucide-react'
import { apiFetch } from '../lib/api'
import type { ModelTelemetryResponse } from '../lib/types'

interface ModelStatusModalProps {
  onClose: () => void
}

export function ModelStatusModal({ onClose }: ModelStatusModalProps) {
  const [data, setData] = useState<ModelTelemetryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = (await apiFetch('/anomalies/models/status')) as ModelTelemetryResponse
      setData(res)
    } catch (err: any) {
      setError(err?.message || 'Failed to load model telemetry')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 size={16} className="text-up" />
      case 'degraded':
        return <AlertTriangle size={16} className="text-warn" />
      default:
        return <XCircle size={16} className="text-down" />
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-surface border border-line rounded-lg w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface-raised/40">
          <div className="flex items-center gap-2.5">
            <Cpu size={16} className="text-accent" />
            <h2 className="font-mono text-[13px] uppercase tracking-widest text-ink font-semibold">
              Surveillance Engine & Model Telemetry
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="p-1 text-ink-faint hover:text-ink transition-colors disabled:opacity-50"
              title="Refresh Telemetry"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1 text-ink-faint hover:text-ink transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3.5 rounded border border-down/30 bg-down/5 text-[12px] font-mono text-down flex items-center gap-2">
              <XCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Overall Health Card */}
          <div className="p-4 rounded-md border border-line bg-raised/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {data && getStatusIcon(data.status)}
              <div>
                <div className="text-[11px] font-mono text-ink-faint uppercase tracking-wider">Engine Status</div>
                <div className="text-[14px] font-mono font-bold text-ink capitalize mt-0.5">
                  {data?.status || (loading ? 'Loading...' : 'Offline')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono text-ink-dim">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-accent" />
                <span>Dual-Detector Architecture</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database size={14} className="text-ink-faint" />
                <span>Rolling 20-Day Windows</span>
              </div>
            </div>
          </div>

          {/* Market-specific model grids */}
          {data && (
            <div className="space-y-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-dim flex items-center gap-1.5">
                <Layers size={13} className="text-accent" />
                <span>Market Model Instances</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.entries(data.markets) as [string, any][]).map(([market, mStatus]) => (
                  <div key={market} className="p-4 rounded-md border border-line bg-void/60 space-y-3">
                    <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[13px] text-ink">{market}</span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                            mStatus.loaded ? 'bg-up/10 text-up border border-up/30' : 'bg-down/10 text-down border border-down/30'
                          }`}
                        >
                          {mStatus.loaded ? 'Active' : 'Unloaded'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-ink-faint">
                        {mStatus.baseline_symbols_count} Baseline Symbols
                      </span>
                    </div>

                    <div className="space-y-2 text-[11px] font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-ink-faint">Isolation Forest:</span>
                        <span className={mStatus.has_isolation_forest ? 'text-up font-medium' : 'text-down'}>
                          {mStatus.has_isolation_forest ? 'Trained & Operational' : 'Not Loaded'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-ink-faint">Multi-Pattern Ensemble:</span>
                        <span className={mStatus.has_multi_pattern ? 'text-up font-medium' : 'text-down'}>
                          {mStatus.has_multi_pattern ? 'Trained & Operational' : 'Not Loaded'}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-line/40">
                        <span className="text-ink-faint text-[10px] uppercase tracking-wider block mb-1.5">
                          Active Manipulation Detectors:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {mStatus.patterns.length > 0 ? (
                            mStatus.patterns.map((p: string) => (
                              <span
                                key={p}
                                className="px-2 py-0.5 rounded text-[10px] font-mono bg-raised text-ink-dim border border-line/80"
                              >
                                {p.replace(/_/g, ' ')}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-ink-faint italic">None active</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Feature Dimension Breakdown */}
              <div className="p-4 rounded-md border border-line bg-void/40 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-ink-faint">
                  Engineered ML Feature Dimensions (14 Features)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(data.markets)[0]?.feature_columns.map((col: string) => (
                    <span
                      key={col}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface border border-line text-ink-dim"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
