import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './auth-context'
import type { LiveAlertEvent } from './types'

type ConnState = 'connecting' | 'live' | 'reconnecting'

const MAX_EVENTS = 200
const BASE_URL = '/api/v1'

interface UseMarketDataStreamResult {
  events: LiveAlertEvent[]
  connState: ConnState
}

export function useMarketDataStream(isDemoMode: boolean): UseMarketDataStreamResult {
  const { getSseToken } = useAuth()
  const [events, setEvents] = useState<LiveAlertEvent[]>([])
  const [connState, setConnState] = useState<ConnState>('connecting')
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(async () => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current)
      demoIntervalRef.current = null
    }

    if (isDemoMode) {
      setConnState('live')
      // Synthesize events
      const generateEvent = () => {
        const isAnomaly = Math.random() > 0.8
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT']
        const symbol = symbols[Math.floor(Math.random() * symbols.length)]
        
        const syntheticEvent: LiveAlertEvent = {
          symbol,
          market: 'CRYPTO',
          price: 50000 * Math.random(),
          volume: 100 * Math.random(),
          timestamp_ms: Date.now(),
          primary_signal: isAnomaly ? (Math.random() > 0.5 ? 'PUMP & DUMP' : 'WASH TRADING') : 'NORMAL',
          anomaly_score: isAnomaly ? 0.75 + (Math.random() * 0.2) : 0.1 + (Math.random() * 0.3),
          severity: isAnomaly ? (Math.random() > 0.5 ? 'HIGH' : 'MEDIUM') : undefined,
          evidence: isAnomaly ? [
            { name: 'Volume_Spike', value: 3.5, threshold: 2.0, triggered: true },
            { name: 'RSI_Overbought', value: 85, threshold: 80, triggered: true }
          ] : []
        }
        
        setEvents(prev => [syntheticEvent, ...prev].slice(0, MAX_EVENTS))
      }
      
      // Generate some initial events
      for (let i = 0; i < 5; i++) generateEvent()
      
      demoIntervalRef.current = setInterval(generateEvent, 3000)
      return
    }

    setConnState('connecting')

    try {
      const token = await getSseToken()
      const es = new EventSource(`${BASE_URL}/alerts/stream/live?token=${encodeURIComponent(token)}`)
      eventSourceRef.current = es

      es.onopen = () => {
        setConnState('live')
      }

      es.onmessage = (e) => {
        try {
          const event: LiveAlertEvent = JSON.parse(e.data)
          setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS))
        } catch {
          // Malformed SSE data — skip, don't crash
        }
      }

      es.onerror = () => {
        // Close the dead connection to prevent native auto-reconnect with a stale token
        es.close()
        setConnState('reconnecting')
        // Reconnect manually to fetch a fresh token
        reconnectTimeoutRef.current = setTimeout(() => connect(), 5000)
      }
    } catch (err) {
      console.error('Failed to acquire SSE token', err)
      setConnState('reconnecting')
      // Retry after a delay
      reconnectTimeoutRef.current = setTimeout(() => connect(), 5000)
    }
  }, [getSseToken, isDemoMode])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current)
      }
    }
  }, [connect])

  return { events, connState }
}
