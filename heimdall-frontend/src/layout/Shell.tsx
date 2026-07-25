import type { ReactNode } from 'react'
import { Rail } from './Rail'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-void text-ink">
      <Rail />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
