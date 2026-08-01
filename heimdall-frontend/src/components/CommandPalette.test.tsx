import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette } from './CommandPalette'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}))

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens upon pressing Ctrl+K', async () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.getByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Search assets, cases/i)).toBeInTheDocument()
  })

  it('fetches remote search results from /search and displays them', async () => {
    const mockResults = {
      results: [
        {
          id: 'anomaly-101',
          entity_id: 101,
          type: 'anomaly',
          title: 'Anomaly #101 (ETHUSDT)',
          subtitle: 'WASH TRADING (Score: 0.92)',
          route: '/anomalies?selected=101',
        },
        {
          id: 'case-5',
          entity_id: 5,
          type: 'case',
          title: 'Case #5: Market Manipulation on ETH',
          subtitle: 'Status: OPEN',
          route: '/investigations?selected=5',
        },
      ],
    }

    vi.mocked(api.apiFetch).mockResolvedValueOnce(mockResults)

    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = screen.getByPlaceholderText(/Search assets, cases/i)

    fireEvent.change(input, { target: { value: 'ETH' } })

    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith('/search?q=ETH')
    })

    expect(await screen.findByText('Anomaly #101 (ETHUSDT)')).toBeInTheDocument()
    expect(await screen.findByText('Case #5: Market Manipulation on ETH')).toBeInTheDocument()
  })
})
