// Removed unused React import;

interface SignalStrengthProps {
  score: number; // 0 to 1
  label?: string;
  size?: 'sm' | 'md';
}

export function SignalStrength({ score, label, size = 'md' }: SignalStrengthProps) {
  const percentage = Math.round(score * 100);

  let activeColorClass = 'bg-ink-dim';
  let textColorClass = 'text-ink-dim';
  let levelLabel = 'Low Confidence';
  let shadowClass = '';
  
  if (score >= 0.8) {
    activeColorClass = 'bg-down border-down/50';
    shadowClass = 'shadow-[0_0_8px_rgba(232,96,76,0.6)]';
    textColorClass = 'text-down font-medium';
    levelLabel = 'High Confidence';
  } else if (score >= 0.5) {
    activeColorClass = 'bg-accent border-accent/50';
    shadowClass = 'shadow-[0_0_8px_rgba(212,166,58,0.6)]';
    textColorClass = 'text-accent font-medium';
    levelLabel = 'Medium Confidence';
  } else {
    activeColorClass = 'bg-ink-dim border-ink-dim/50';
    textColorClass = 'text-ink-dim';
  }

  const heightClass = size === 'sm' ? 'h-1.5' : 'h-2';
  const segments = 5;
  const activeSegments = Math.ceil(score * segments);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <span className={`${textColorClass} tabular`}>{percentage}%</span>
        <span className="text-ink-faint text-[10px] uppercase tracking-wider">{label || levelLabel}</span>
      </div>
      <div className="flex gap-0.5 w-full">
        {Array.from({ length: segments }).map((_, i) => {
          const isActive = i < activeSegments;
          return (
            <div 
              key={i} 
              className={`flex-1 ${heightClass} rounded-[1px] transition-all duration-500 border ${
                isActive ? `${activeColorClass} ${shadowClass}` : 'bg-void border-line/40'
              }`} 
            />
          )
        })}
      </div>
    </div>
  );
}
