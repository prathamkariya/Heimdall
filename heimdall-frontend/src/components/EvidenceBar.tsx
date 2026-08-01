interface EvidenceBarProps {
  name: string;
  observed: number;
  threshold: number;
  triggered: boolean;
}

function getSignalTooltip(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('volume_zscore')) return 'Measures how many standard deviations the current volume is from the 20-day rolling mean.'
  if (n.includes('price_volatility')) return 'Measures short-term price fluctuations compared to historical volatility.'
  if (n.includes('body_ratio')) return 'Analyzes the candlestick body size relative to its wicks to detect unusual momentum.'
  if (n.includes('return')) return 'Measures the price return percentage relative to historical norms.'
  if (n.includes('spread')) return 'Detects abnormal widening or tightening of the bid-ask spread.'
  if (n.includes('order_book')) return 'Analyzes imbalances in the order book depth.'
  return 'Evidence signal contributing to anomaly detection.'
}

export function EvidenceBar({ name, observed, threshold, triggered }: EvidenceBarProps) {
  // We want to visualize the observed value on a scale where threshold is around 50% or 75% point.
  // Let's cap the max display at max of observed and threshold * 1.5 for a nice visual scale.
  const maxScale = Math.max(observed, threshold * 1.5);
  
  // Guard against divide by zero if maxScale somehow is 0
  const effectiveMax = maxScale > 0 ? maxScale : 1;
  const observedPercent = Math.min(100, (observed / effectiveMax) * 100);
  const thresholdPercent = (threshold / effectiveMax) * 100;

  return (
    <div 
      className="flex flex-col gap-2 bg-raised/30 p-3 rounded border border-line/30 hover:border-line/60 transition-colors cursor-help"
      title={getSignalTooltip(name)}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono text-ink font-medium">
          {name.replace(/_/g, ' ')}
        </span>
        <span className={`text-[10px] font-mono font-semibold ${
          triggered ? 'text-down' : 'text-up'
        }`}>
          {triggered ? '✓ FIRED' : '– OK'}
        </span>
      </div>
      
      <div className="relative h-1.5 w-full bg-void/50 rounded overflow-hidden mt-1 mb-1">
        {/* The observed bar */}
        <div 
          className={`absolute top-0 left-0 h-full rounded transition-all duration-500 ${
            triggered ? 'bg-down shadow-[0_0_8px_rgba(232,96,76,0.6)]' : 'bg-up/70'
          }`}
          style={{ width: `${observedPercent}%`, transitionTimingFunction: 'var(--ease-out)' }}
        />
        {/* The threshold marker */}
        <div 
          className="absolute top-0 h-full w-[2px] bg-ink/70 z-10 shadow-[0_0_4px_rgba(255,255,255,0.4)]"
          style={{ left: `${thresholdPercent}%` }}
        />
      </div>

      <div className="flex justify-between text-[10px] font-mono text-ink-dim mt-0.5">
        <span>Observed: <span className="text-ink">{observed.toFixed(4)}</span></span>
        <span>Thr: {threshold.toFixed(4)}</span>
      </div>
    </div>
  );
}
