interface SkeletonProps {
  className?: string
  shape?: 'rect' | 'circle'
}

export function Skeleton({ className = '', shape = 'rect' }: SkeletonProps) {
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded'
  return (
    <div className={`animate-shimmer bg-raised/50 ${shapeClass} ${className}`} />
  )
}
