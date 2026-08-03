import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Run cleanup after each test case
afterEach(() => {
  cleanup()
})

if (typeof globalThis.EventSource === 'undefined') {
  class MockEventSource {
    url: string
    onmessage: ((ev: any) => void) | null = null
    onerror: ((ev: any) => void) | null = null
    onopen: ((ev: any) => void) | null = null
    constructor(url: string) {
      this.url = url
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  globalThis.EventSource = MockEventSource as any
}

