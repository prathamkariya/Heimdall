import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal'

describe('KeyboardShortcutsModal', () => {
  it('renders keyboard shortcuts cheat sheet', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal onClose={onClose} />)

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    expect(screen.getByText(/HEIMDALL Surveillance Workstation Navigation/i)).toBeInTheDocument()
    expect(screen.getByText(/Open Command Palette & Omnisearch/i)).toBeInTheDocument()
    expect(screen.getByText(/Pause \/ Resume live market data stream/i)).toBeInTheDocument()
  })

  it('closes when close button is clicked or Escape key pressed', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
