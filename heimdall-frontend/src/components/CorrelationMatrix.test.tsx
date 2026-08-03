import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CorrelationMatrix } from './CorrelationMatrix'

// Mock apiFetch so it doesn't try to call real backend
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}))

describe('CorrelationMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders matrix header and tracked instrument headers', async () => {
    render(<CorrelationMatrix />)

    expect(screen.getByText('Cross-Asset Correlation')).toBeInTheDocument()
    
    // Check for symbol headers
    await waitFor(() => {
      expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
      expect(screen.getAllByText('ETH').length).toBeGreaterThan(0)
      expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0)
    })
  })
})
