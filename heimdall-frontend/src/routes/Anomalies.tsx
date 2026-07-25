import { TriangleAlert } from 'lucide-react'
import { RouteStub } from './RouteStub'

export function Anomalies() {
  return (
    <RouteStub
      icon={TriangleAlert}
      title="Anomalies"
      note="Not built yet. Backed by GET /anomalies — paginated, user-scoped, includes symbol and market_timestamp per row. pattern_scores arrives as a JSON string and needs parsing before render."
    />
  )
}
