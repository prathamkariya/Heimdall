import { Eye } from 'lucide-react'
import { RouteStub } from './RouteStub'

export function Watchlists() {
  return (
    <RouteStub
      icon={Eye}
      title="Watchlists"
      note="Not built yet. Symbols here also scope which live alerts get pushed to this user's SSE connection — watchlist changes apply on reconnect, not mid-stream."
    />
  )
}
