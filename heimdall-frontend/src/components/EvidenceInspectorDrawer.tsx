import { X, TrendingUp, Info, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { EvidenceSignal } from '../lib/types'

interface EvidenceInspectorDrawerProps {
  signal: EvidenceSignal & { zScore?: number; percentile?: number; formula?: string; description?: string }
  symbol: string
  onClose: () => void
}

// signal.value is used throughout (EvidenceSignal uses .value, not .observed)

const SIGNAL_META: Record<string, { description: string; formula: string; unit: string }> = {
  volume_zscore: {
    description: 'Measures how many standard deviations the current volume is above the 20-period rolling mean. A z-score above 3.0 is classified as statistically anomalous.',
    formula: 'Z = (V_observed − μ_V) / σ_V',
    unit: 'σ',
  },
  price_volatility: {
    description: 'Short-term OHLCV price swing relative to the asset\'s 20-period historical volatility baseline. Elevated when price range significantly exceeds expected bounds.',
    formula: 'Vol = (H − L) / Close_prev − σ_hist',
    unit: '%',
  },
  body_ratio: {
    description: 'Ratio of the candlestick body to its full shadow. High body-to-wick ratios indicate strong directional momentum. Extremely high values can indicate spoofing.',
    formula: 'R = |Close − Open| / (High − Low)',
    unit: 'ratio',
  },
  return_z: {
    description: 'Normalized price return against historical return distribution. Catches sudden price dislocations not explained by volume.',
    formula: 'Z_ret = (R_t − μ_R) / σ_R',
    unit: 'σ',
  },
  spread: {
    description: 'Bid-ask spread normalized to average. Abnormal spread widening is a leading indicator of liquidity withdrawal before manipulation events.',
    formula: 'S_norm = (Spread_t − μ_S) / σ_S',
    unit: 'σ',
  },
  wash_score: {
    description: 'Multi-factor composite score measuring the likelihood of wash trading based on self-matching volume, price reversion, and volume oscillation patterns.',
    formula: 'W = α·VolumeOscillation + β·PriceReversion + γ·SelfMatch',
    unit: 'score',
  },
  pump_score: {
    description: 'Detects coordinated pump-and-dump patterns: rapid price appreciation followed by volume collapse and aggressive reversal.',
    formula: 'P = Phase1(ΔP_up, ΔV_up) × Phase2(ΔP_down, ΔV_down)',
    unit: 'score',
  },
}

function getSignalMeta(name: string) {
  const key = Object.keys(SIGNAL_META).find(k => name.toLowerCase().includes(k))
  return key ? SIGNAL_META[key] : {
    description: 'Evidence signal from the anomaly detection pipeline contributing to the composite anomaly score.',
    formula: 'Signal > Threshold → Triggered',
    unit: 'value',
  }
}

/** Estimate percentile using logistic approximation of normal CDF */
function estimatePercentile(z: number): number {
  return (1 / (1 + Math.exp(-1.702 * z))) * 100
}

export function EvidenceInspectorDrawer({ signal, symbol, onClose }: EvidenceInspectorDrawerProps) {
  const meta = getSignalMeta(signal.name)
  const zScore = signal.z_score
  const percentile = zScore !== undefined && zScore !== null ? estimatePercentile(zScore) : null

  const multiplier = signal.threshold > 0 ? (signal.value / signal.threshold) : 1
  const isHighSeverity = multiplier >= 2.5
  const isMediumSeverity = multiplier >= 1.5

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-void/60 backdrop-blur-sm animate-fade-in" />

      {/* Panel */}
      <div
        className="relative w-[520px] h-full overflow-y-auto bg-surface border-l border-line shadow-2xl animate-slide-in-right flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-accent" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
                Evidence Inspector
              </span>
            </div>
            <h2 className="text-base font-semibold text-ink font-mono">
              {signal.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </h2>
            <span className="text-[11px] text-ink-faint mt-0.5 block">{symbol}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`font-mono text-[10px] px-2 py-1 rounded border flex items-center gap-1.5 ${
              signal.triggered
                ? isHighSeverity
                  ? 'bg-down/15 border-down/40 text-down'
                  : 'bg-accent/15 border-accent/40 text-accent'
                : 'bg-up/10 border-up/30 text-up'
            }`}>
              {signal.triggered
                ? <AlertTriangle size={10} />
                : <CheckCircle2 size={10} />}
              {signal.triggered ? (isHighSeverity ? 'HIGH RISK' : isMediumSeverity ? 'ELEVATED' : 'TRIGGERED') : 'WITHIN BOUNDS'}
            </span>
            <button
              onClick={onClose}
              aria-label="Close Inspector"
              className="text-ink-faint hover:text-ink transition-fast cursor-pointer rounded-full p-1 hover:bg-raised"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Observed vs Threshold */}
          <div className="animate-fade-in stagger-1">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-faint mb-3">
              Observed vs Baseline Threshold
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-void border border-line rounded-lg p-4 text-center">
                <div className={`text-2xl font-mono font-bold ${signal.triggered ? 'text-down' : 'text-up'}`}>
                  {signal.value.toFixed(3)}
                </div>
                <div className="text-[10px] font-mono text-ink-faint mt-1 uppercase tracking-wider">Observed</div>
              </div>
              <div className="bg-void border border-line rounded-lg p-4 text-center">
                <div className="text-2xl font-mono font-bold text-ink-dim">
                  {signal.threshold.toFixed(3)}
                </div>
                <div className="text-[10px] font-mono text-ink-faint mt-1 uppercase tracking-wider">Threshold</div>
              </div>
              <div className="bg-void border border-line rounded-lg p-4 text-center">
                <div className={`text-2xl font-mono font-bold ${multiplier > 1.5 ? 'text-down' : 'text-ink'}`}>
                  {multiplier.toFixed(2)}×
                </div>
                <div className="text-[10px] font-mono text-ink-faint mt-1 uppercase tracking-wider">Multiple</div>
              </div>
            </div>

            {/* Bar visual */}
            <div className="mt-4">
              <div className="relative h-3 w-full bg-raised rounded overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 rounded ${signal.triggered ? 'bg-down' : 'bg-up'}`}
                  style={{ width: `${Math.min(100, (signal.value / Math.max(signal.value * 1.2, signal.threshold * 1.5)) * 100)}%` }}
                />
                <div
                  className="absolute top-0 h-full w-0.5 bg-ink/80"
                  style={{ left: `${(signal.threshold / Math.max(signal.value * 1.2, signal.threshold * 1.5)) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-ink-faint mt-1">
                <span>0</span>
                <span className="text-ink-dim">↑ Threshold ({signal.threshold.toFixed(3)})</span>
                <span>Max</span>
              </div>
            </div>
          </div>

          {/* Z-Score and Percentile */}
          <div className="grid grid-cols-2 gap-4 animate-fade-in stagger-2">
            <div className="bg-void/50 border border-line/60 rounded-lg p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-faint mb-2">Z-Score</div>
              <div className={zScore !== undefined && zScore !== null ? `text-xl font-mono font-bold ${Math.abs(zScore) > 2 ? 'text-down' : 'text-ink'}` : 'text-xl font-mono font-medium text-ink-faint italic'}>
                {zScore !== undefined && zScore !== null ? `${zScore > 0 ? '+' : ''}${zScore.toFixed(2)}σ` : 'Not available'}
              </div>
              <div className="text-[10px] text-ink-faint mt-1">
                {zScore !== undefined && zScore !== null
                  ? (Math.abs(zScore) > 3 ? 'Extreme outlier' : Math.abs(zScore) > 2 ? 'Significant deviation' : Math.abs(zScore) > 1 ? 'Minor deviation' : 'Within normal range')
                  : 'No baseline available'}
              </div>
            </div>
            <div className="bg-void/50 border border-line/60 rounded-lg p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-faint mb-2">Percentile</div>
              <div className={percentile !== null ? `text-xl font-mono font-bold ${percentile > 95 ? 'text-down' : 'text-ink'}` : 'text-xl font-mono font-medium text-ink-faint italic'}>
                {percentile !== null ? `p${percentile.toFixed(1)}` : 'Not available'}
              </div>
              <div className="text-[10px] text-ink-faint mt-1">
                {percentile !== null
                  ? (percentile > 99 ? 'Rarer than 1 in 100 observations' : percentile > 95 ? 'Rarer than 1 in 20' : 'Within expected range')
                  : 'No distribution available'}
              </div>
            </div>
          </div>

          {/* Detection Formula */}
          <div className="bg-void border border-line/60 rounded-lg p-4 animate-fade-in stagger-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-faint mb-2">Detection Formula</div>
            <code className="text-[12px] font-mono text-accent block leading-relaxed">
              {signal.formula ?? meta.formula}
            </code>
          </div>

          {/* Signal Description */}
          <div className="text-[12px] text-ink-dim leading-relaxed border-t border-line/40 pt-4 animate-fade-in stagger-4">
            {signal.description ?? meta.description}
          </div>
        </div>
      </div>
    </div>
  )
}
