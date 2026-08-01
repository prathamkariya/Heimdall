export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-raised/80 rounded ${className}`} />
  )
}
