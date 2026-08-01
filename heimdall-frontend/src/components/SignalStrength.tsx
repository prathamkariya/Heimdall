// Removed unused React import;

interface SignalStrengthProps {
  score: number; // 0 to 1
  label?: string;
  size?: 'sm' | 'md';
}

export function SignalStrength({ score, label, size = 'md' }: SignalStrengthProps) {
  const percentage = Math.round(score * 100);

  let colorClass = 'bg-ink-dim';
  let textColorClass = 'text-ink-dim';
  let levelLabel = 'Low Confidence';
  
  if (score >= 0.8) {
    colorClass = 'bg-down shadow-[0_0_8px_rgba(232,96,76,0.4)]';
    textColorClass = 'text-down font-medium';
    levelLabel = 'High Confidence';
  } else if (score >= 0.5) {
    colorClass = 'bg-accent shadow-[0_0_8px_rgba(212,166,58,0.4)]';
    textColorClass = 'text-accent';
    levelLabel = 'Medium Confidence';
  } else if (score >= 0) {
    colorClass = 'bg-ink-dim';
    textColorClass = 'text-ink-dim';
  }

  const heightClass = size === 'sm' ? 'h-1' : 'h-1.5';

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <span className={textColorClass}>{percentage}%</span>
        <span className="text-ink-faint text-[10px] uppercase tracking-wider">{label || levelLabel}</span>
      </div>
      <div className={`${heightClass} w-full bg-raised rounded-sm overflow-hidden border border-line/40`}>
        <div 
          className={`h-full ${colorClass} transition-all duration-500`} 
          style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} 
        />
      </div>
    </div>
  );
}
