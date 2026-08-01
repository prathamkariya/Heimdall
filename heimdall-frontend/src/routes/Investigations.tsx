import { useState, useEffect, useCallback } from 'react'
import { useApiFetch } from '../lib/hooks'
import { useKeyboardNav } from '../lib/useKeyboardNav'
import type { AnomalyPaginatedResponse, CasePaginatedResponse, Analyst } from '../lib/types'
import { CaseList } from '../components/CaseList'
import { CaseWorkspace } from '../components/CaseWorkspace'

const PAGE_SIZE = 20

export function Investigations() {
  const [offset, setOffset] = useState(0)
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null)

  // Fetch lists and global references
  const { data, loading, error, execute: executeCases } = useApiFetch<CasePaginatedResponse>()
  const { data: currentUser, execute: executeCurrentUser } = useApiFetch<{ id: number; role: string }>()
  const { data: analysts, execute: executeAnalysts } = useApiFetch<Analyst[]>()
  const { data: anomaliesData, execute: executeAllAnomalies } = useApiFetch<AnomalyPaginatedResponse>()

  const fetchCurrentUser = useCallback(() => {
    executeCurrentUser('/auth/me')
  }, [executeCurrentUser])

  const fetchCases = useCallback(() => {
    executeCases(`/cases?limit=${PAGE_SIZE}&offset=${offset}`)
  }, [executeCases, offset])

  const fetchAnalysts = useCallback(() => {
    executeAnalysts('/cases/analysts')
  }, [executeAnalysts])

  // Keyboard navigation for the list
  const { focusedIndex } = useKeyboardNav({
    itemCount: data?.items.length || 0,
    onSelect: (index) => {
      if (data?.items[index]) {
        setSelectedCaseId(data.items[index].id)
      }
    },
    onClose: () => setSelectedCaseId(null),
    isActive: true
  })

  // Initial load
  useEffect(() => {
    fetchCurrentUser()
    fetchAnalysts()
    executeAllAnomalies('/anomalies?limit=100')
  }, [fetchCurrentUser, fetchAnalysts, executeAllAnomalies])

  // React to pagination
  useEffect(() => {
    fetchCases()
  }, [fetchCases])

  return (
    <div className="flex h-full select-none relative overflow-hidden bg-void">
      <CaseList
        data={data}
        loading={loading}
        error={error}
        selectedId={selectedCaseId}
        focusedIndex={focusedIndex}
        analysts={analysts}
        onSelect={setSelectedCaseId}
        onRetry={fetchCases}
        setOffset={setOffset}
      />
      
      {selectedCaseId && (
        <CaseWorkspace
          caseId={selectedCaseId}
          currentUser={currentUser}
          analysts={analysts}
          allAnomalies={anomaliesData?.items}
          onClose={() => setSelectedCaseId(null)}
          onUpdate={fetchCases}
        />
      )}
    </div>
  )
}
