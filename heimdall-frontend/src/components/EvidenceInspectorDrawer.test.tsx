import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EvidenceInspectorDrawer } from './EvidenceInspectorDrawer'
import type { EvidenceSignal } from '../lib/types'

describe('EvidenceInspectorDrawer', () => {
  const mockSignal: EvidenceSignal = {
    name: 'volume_zscore',
    value: 4.85,
    threshold: 3.0,
    triggered: true,
  }

  it('renders signal title, observed value and threshold', () => {
    render(
      <EvidenceInspectorDrawer
        signal={mockSignal}
        symbol="BTCUSDT"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Evidence Inspector')).toBeInTheDocument()
    expect(screen.getByText('BTCUSDT')).toBeInTheDocument()
    expect(screen.getByText('4.850')).toBeInTheDocument()
    expect(screen.getByText('3.000')).toBeInTheDocument()
    expect(screen.getByText('ELEVATED')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked or ESC is pressed', () => {
    const onClose = vi.fn()
    render(
      <EvidenceInspectorDrawer
        signal={mockSignal}
        symbol="ETHUSDT"
        onClose={onClose}
      />
    )

    const closeBtn = screen.getByLabelText('Close Inspector')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
