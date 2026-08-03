import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './auth-context'
import type { LiveAlertEvent } from './types'

type ConnState = 'connecting' | 'live' | 'reconnecting'

const MAX_EVENTS = 200
const BASE_URL = '/api/v1'

interface UseMarketDataStreamResult {
  events: LiveAlertEvent[]
  connState: ConnState
  isPaused: boolean
  bufferedCount: number
  velocity: number // events per minute
  togglePause: () => void
  flushBuffer: () => void
}

export function useMarketDataStream(isDemoMode: boolean): UseMarketDataStreamResult {
  const { getSseToken } = useAuth()
  const [events, setEvents] = useState<LiveAlertEvent[]>([])
  const [bufferedEvents, setBufferedEvents] = useState<LiveAlertEvent[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [connState, setConnState] = useState<ConnState>('connecting')
  const [velocity, setVelocity] = useState(0)

  const isPausedRef = useRef(isPaused)
  isPausedRef.current = isPaused

  const eventTimestampsRef = useRef<number[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track velocity (rolling 15 seconds window converted to events/min)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const cutoff = now - 15000
      eventTimestampsRef.current = eventTimestampsRef.current.filter(ts => ts > cutoff)
      const count = eventTimestampsRef.current.length
      setVelocity(Math.round((count / 15) * 60))
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  const handleIncomingEvent = useCallback((event: LiveAlertEvent) => {
    eventTimestampsRef.current.push(Date.now())
    if (isPausedRef.current) {
      setBufferedEvents(prev => [event, ...prev].slice(0, MAX_EVENTS))
    } else {
      setEvents(prev => [event, ...prev].slice(0, MAX_EVENTS))
    }
  }, [])

  const togglePause = useCallback(() => {
    setIsPaused(prev => {
      const next = !prev
      if (!next) {
        // Unpausing: flush buffered items
        setEvents(current => {
          const combined = [...bufferedEvents, ...current].slice(0, MAX_EVENTS)
          return combined
        })
        setBufferedEvents([])
      }
      return next
    })
  }, [bufferedEvents])

  const flushBuffer = useCallback(() => {
    setEvents(current => [...bufferedEvents, ...current].slice(0, MAX_EVENTS))
    setBufferedEvents([])
  }, [bufferedEvents])

  const connect = useCallback(async () => {
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
      const generateEvent = () => {
        const isAnomaly = Math.random() > 0.8
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AAPL', 'NVDA', 'TSLA']
        const symbol = symbols[Math.floor(Math.random() * symbols.length)]
        const isCrypto = symbol.includes('USDT')
        
        const syntheticEvent: LiveAlertEvent = {
          symbol,
          market: isCrypto ? 'CRYPTO' : 'US_EQUITY',
          price: isCrypto ? (50000 * Math.random()) : (150 + Math.random() * 200),
          volume: 100 * Math.random(),
          timestamp_ms: Date.now(),
          primary_signal: isAnomaly ? (Math.random() > 0.5 ? 'PUMP & DUMP' : 'WASH TRADING') : 'NORMAL',
          anomaly_score: isAnomaly ? 0.75 + (Math.random() * 0.2) : 0.1 + (Math.random() * 0.3),
          severity: isAnomaly ? (Math.random() > 0.6 ? 'CRITICAL' : 'HIGH') : undefined,
          low_confidence: false,
          evidence: isAnomaly ? [
            { name: 'Volume_Spike', value: 3.5, threshold: 2.0, triggered: true },
            { name: 'RSI_Overbought', value: 85, threshold: 80, triggered: true }
          ] : []
        }
        handleIncomingEvent(syntheticEvent)
      }
      
      for (let i = 0; i < 5; i++) generateEvent()
      demoIntervalRef.current = setInterval(generateEvent, 2500)
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
          handleIncomingEvent(event)
        } catch {
          // skip malformed
        }
      }

      es.onerror = () => {
        es.close()
        setConnState('reconnecting')
        reconnectTimeoutRef.current = setTimeout(() => connect(), 5000)
      }
    } catch (err) {
      console.error('Failed to acquire SSE token', err)
      setConnState('reconnecting')
      reconnectTimeoutRef.current = setTimeout(() => connect(), 5000)
    }
  }, [getSseToken, isDemoMode, handleIncomingEvent])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (eventSourceRef.current) eventSourceRef.current.close()
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current)
    }
  }, [connect])

  return {
    events,
    connState,
    isPaused,
    bufferedCount: bufferedEvents.length,
    velocity,
    togglePause,
    flushBuffer,
  }
}
