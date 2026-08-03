import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationCenter, pushNotification } from './NotificationCenter'

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}))

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the notification bell button and toggles drawer', () => {
    render(<NotificationCenter />)

    const bellBtn = screen.getByLabelText('Open notifications')
    expect(bellBtn).toBeInTheDocument()

    // Open drawer
    fireEvent.click(bellBtn)
    expect(screen.getByText('Notification Center')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Investigations')).toBeInTheDocument()

    // Close drawer
    const closeBtn = screen.getByLabelText('Close notifications')
    fireEvent.click(closeBtn)
    expect(screen.queryByText('Notification Center')).not.toBeInTheDocument()
  })

  it('displays pushed notifications', () => {
    render(<NotificationCenter />)

    pushNotification({
      category: 'critical',
      title: 'TEST_PUMP_DETECTED',
      body: 'High volume spike detected on BTCUSDT',
      severity: 'high',
    })

    // Open drawer
    const bellBtn = screen.getByLabelText('Open notifications')
    fireEvent.click(bellBtn)

    expect(screen.getByText('TEST_PUMP_DETECTED')).toBeInTheDocument()
    expect(screen.getByText('High volume spike detected on BTCUSDT')).toBeInTheDocument()
  })
})
