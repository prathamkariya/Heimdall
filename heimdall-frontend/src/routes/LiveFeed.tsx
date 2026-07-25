import { Activity } from 'lucide-react'
import { RouteStub } from './RouteStub'

export function LiveFeed() {
  return (
    <RouteStub
      icon={Activity}
      title="Live Feed"
      note="Not built yet. Connects to GET /alerts/stream/live over SSE — needs its own reconnect state, independent of hosting; that isn't solved by the VM staying warm."
    />
  )
}
