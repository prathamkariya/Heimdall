import type { LucideIcon } from 'lucide-react'

export function RouteStub({
  icon: Icon,
  title,
  note,
}: {
  icon: LucideIcon
  title: string
  note: string
}) {
  return (
    <div className="flex h-full flex-col items-start justify-center px-12">
      <Icon size={22} strokeWidth={1.5} className="mb-4 text-ink-faint" />
      <h1 className="mb-1 text-lg font-medium text-ink">{title}</h1>
      <p className="max-w-md text-sm leading-relaxed text-ink-dim">{note}</p>
    </div>
  )
}
