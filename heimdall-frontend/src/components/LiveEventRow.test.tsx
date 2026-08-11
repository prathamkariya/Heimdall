import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LiveEventRow } from './LiveEventRow'
import type { LiveAlertEvent } from '../lib/types'

describe('LiveEventRow', () => {
  const mockEvent: LiveAlertEvent = {
    symbol: 'BTCUSDT',
    market: 'CRYPTO',
    price: 60000,
    volume: 500,
    anomaly_score: 0.9,
    low_confidence: false,
    timestamp_ms: 1625097600000,
    severity: 'CRITICAL',
  }

  it('renders standard event data correctly', () => {
    const onClick = vi.fn()
    render(
      <LiveEventRow
        event={mockEvent}
        scored={true}
        primarySignal="WASH TRADING"
        isNew={false}
        isSelected={false}
        isFocused={false}
        onClick={onClick}
      />
    )

    expect(screen.getByText('BTCUSDT')).toBeInTheDocument()
    expect(screen.getByText('CRYPTO')).toBeInTheDocument()
    expect(screen.getByText('60000.00')).toBeInTheDocument()
    expect(screen.getByText('500.0')).toBeInTheDocument()
    expect(screen.getByText('0.9000')).toBeInTheDocument()
    expect(screen.getByText('WASH TRADING')).toBeInTheDocument()
    // Severity badge renders "CRITICAL"
    expect(screen.getByText('CRITICAL')).toBeInTheDocument()
  })

  it('triggers onClick when clicked', () => {
    const onClick = vi.fn()
    render(
      <LiveEventRow
        event={mockEvent}
        scored={true}
        primarySignal="NORMAL"
        isNew={false}
        isSelected={false}
        isFocused={false}
        onClick={onClick}
      />
    )

    fireEvent.click(screen.getByText('BTCUSDT'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('adds visual indicators when selected', () => {
    const { container } = render(
      <LiveEventRow
        event={mockEvent}
        scored={true}
        primarySignal="NORMAL"
        isNew={false}
        isSelected={true}
        isFocused={false}
        onClick={vi.fn()}
      />
    )

    // The arrow should appear
    expect(screen.getByText('▶')).toBeInTheDocument()
    
    // The container should have the selected classes
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('bg-raised/40')
    expect(wrapper.className).toContain('border-l-accent')
  })
})
