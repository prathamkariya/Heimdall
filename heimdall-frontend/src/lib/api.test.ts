import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch, initializeAuth } from './api'

// Mock the global fetch function
global.fetch = vi.fn()

describe('apiFetch', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Reset auth
    initializeAuth(() => '')
  })

  it('should construct the correct URL and default headers', async () => {
    const mockFetch = vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true })
    } as Response)

    await apiFetch('/test-endpoint')

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/test-endpoint', expect.objectContaining({
      headers: expect.any(Headers)
    }))
    
    // Check that Content-Type is set to application/json by default
    const callArgs = mockFetch.mock.calls[0]
    const headers = callArgs[1]?.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.has('Authorization')).toBe(false)
  })

  it('should inject authorization header if token is available', async () => {
    initializeAuth(() => 'fake-token-123')
    
    const mockFetch = vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true })
    } as Response)

    await apiFetch('/secure-endpoint')

    const callArgs = mockFetch.mock.calls[0]
    const headers = callArgs[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer fake-token-123')
  })

  it('should throw an error if response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Invalid request' })
    } as Response)

    await expect(apiFetch('/fail-endpoint')).rejects.toThrow('Invalid request')
  })
})
