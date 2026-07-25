import { FileText } from 'lucide-react'
import { RouteStub } from './RouteStub'

export function Reports() {
  return (
    <RouteStub
      icon={FileText}
      title="Reports"
      note="Not built yet. Generates a MAR report via Gemini for a selected anomaly — ownership-checked server-side against the anomaly's owning user."
    />
  )
}
