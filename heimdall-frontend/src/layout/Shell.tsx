import type { ReactNode } from 'react'
import { Rail } from './Rail'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-void text-ink select-none">
      <Rail />
      <div className="flex flex-col flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-void">{children}</main>
        <footer className="h-6 shrink-0 bg-surface border-t border-line px-4 flex items-center justify-between font-mono text-[9px] text-ink-faint select-none">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-up"></span>NYSE FEED</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-up"></span>NSE FEED</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-up"></span>BINANCE WS</span>
          </div>
          <div className="flex items-center gap-4">
            <span>PING: 14ms</span>
            <span>SECURE CHANNEL: SSL/TLS</span>
            <span>HEIMDALL v0.8.2</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
