import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CaseList } from './CaseList'

vi.mock('../lib/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      enableSound: false,
      compactView: false,
      autoScroll: true,
      darkMode: true
    }
  })
}))

describe('CaseList', () => {
  const mockCases = [
    {
      id: 1,
      title: 'Suspicious Volume Spike',
      status: 'OPEN',
      severity: 'HIGH',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee_id: null
    },
    {
      id: 2,
      title: 'Wash Trading Pattern',
      status: 'RESOLVED',
      severity: 'CRITICAL',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee_id: 1
    }
  ]

  it('renders a list of cases', () => {
    render(
      <CaseList 
        data={{ items: mockCases as any, total: 2, limit: 50, offset: 0 }}
        loading={false}
        error={null}
        selectedId={null}
        focusedIndex={-1}
        analysts={[]}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        setOffset={vi.fn()}
      />
    )
    
    expect(screen.getByText('Suspicious Volume Spike')).toBeInTheDocument()
    expect(screen.getByText('Wash Trading Pattern')).toBeInTheDocument()
  })

  it('displays the empty state when no cases are present', () => {
    render(
      <CaseList 
        data={{ items: [], total: 0, limit: 50, offset: 0 }}
        loading={false}
        error={null}
        selectedId={null}
        focusedIndex={-1}
        analysts={[]}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        setOffset={vi.fn()}
      />
    )
    
    expect(screen.getByText('No investigations currently assigned')).toBeInTheDocument()
  })
})
