import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMarketDataStream } from './useMarketDataStream'

// Mock auth context
vi.mock('./auth-context', () => ({
  useAuth: () => ({
    getSseToken: vi.fn().mockResolvedValue('mock-token'),
    isAuthenticated: true,
  }),
}))

describe('useMarketDataStream', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('initializes with connecting state and empty events', () => {
    const { result } = renderHook(() => useMarketDataStream(false))
    expect(result.current.connState).toBe('connecting')
    expect(result.current.events).toEqual([])
    expect(result.current.isPaused).toBe(false)
    expect(result.current.bufferedCount).toBe(0)
  })

  it('allows toggling pause mode', () => {
    const { result } = renderHook(() => useMarketDataStream(false))

    act(() => {
      result.current.togglePause()
    })

    expect(result.current.isPaused).toBe(true)

    act(() => {
      result.current.togglePause()
    })

    expect(result.current.isPaused).toBe(false)
  })
})
