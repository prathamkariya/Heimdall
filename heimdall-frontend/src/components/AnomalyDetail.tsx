import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'
import { apiFetch } from '../lib/api'
import type { AnomalyListItem, EvidenceSignal } from '../lib/types'
import { SignalStrength } from './SignalStrength'
import { EvidenceBar } from './EvidenceBar'
import { CollapsibleSection } from './CollapsibleSection'
import { Skeleton } from './Skeleton'
import { formatDate } from '../lib/utils'
import { useSettings } from '../lib/SettingsContext'

interface AnomalyDetailProps {
  anomaly: AnomalyListItem
  cases: any[]
  onClose: () => void
  onCaseUpdated: () => void
  onSelectAnomaly?: (anomaly: AnomalyListItem) => void
}

/** Map pattern_scores keys → human labels shown on chart markers */
const PATTERN_LABELS: Record<string, string> = {
  pump_and_dump:      'PUMP & DUMP',
  wash_trading:       'WASH TRADING',
  spoofing:           'SPOOFING',
  layering:           'LAYERING',
}

/** Severity → hex color (matches design tokens) */
function severityColor(severity: string | undefined): string {
  switch ((severity ?? '').toUpperCase()) {
    case 'CRITICAL': return '#e8604c'
    case 'HIGH':     return '#ea8c55'
    case 'MEDIUM':   return '#d9a441'
    default:         return '#7c8790'
  }
}

/** Compute the primary pattern label from pattern_scores JSON string */
function primaryPatternLabel(patternScoresRaw: string | null): string {
  if (!patternScoresRaw) return 'ANOMALY'
  try {
    const scores: Record<string, number> = JSON.parse(patternScoresRaw)
    const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
    return top ? (PATTERN_LABELS[top[0]] ?? top[0].toUpperCase().replace(/_/g, ' ')) : 'ANOMALY'
  } catch {
    return 'ANOMALY'
  }
}

/** Compute a simple N-period SMA over an array of close prices. */
function computeSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    const slice = closes.slice(i - period + 1, i + 1)
    return slice.reduce((s, v) => s + v, 0) / period
  })
}

/** Compute Bollinger Bands (20, 2) */
function computeBollingerBands(closes: number[], period = 20, multiplier = 2) {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    const slice = closes.slice(i - period + 1, i + 1)
    const sma = slice.reduce((s, v) => s + v, 0) / period
    const variance = slice.reduce((s, v) => s + Math.pow(v - sma, 2), 0) / period
    const stdDev = Math.sqrt(variance)
    return {
      upper: sma + multiplier * stdDev,
      middle: sma,
      lower: sma - multiplier * stdDev,
    }
  })
}

/** Compute Relative Strength Index (14-period) */
function computeRSI(closes: number[], period = 14): (number | null)[] {
  if (closes.length <= period) return closes.map(() => null)
  const changes: number[] = []
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1])
  }
  let gains = 0
  let losses = 0
  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) gains += changes[i]
    else losses += Math.abs(changes[i])
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  const rsi: (number | null)[] = new Array(period).fill(null)
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss
  rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + rs0)))

  for (let i = period; i < changes.length; i++) {
    const chg = changes[i]
    const gain = chg >= 0 ? chg : 0
    const loss = chg < 0 ? Math.abs(chg) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + rs)))
  }
  return rsi
}

interface AnomalyChartProps {
  symbol: string
  marketTimestamp: string
  anomaly?: AnomalyListItem
}

export function AnomalyChart({ symbol, marketTimestamp, anomaly }: AnomalyChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const rsiContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const rsiChartRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [callout, setCallout] = useState<{ close: number; volumeSurge: number; rsi?: number; isHover?: boolean } | null>(null)
  const [showSma, setShowSma] = useState(true)
  const [showBands, setShowBands] = useState(false)
  const [showRsi, setShowRsi] = useState(false)

  useEffect(() => {
    let active = true
    let chart: any = null
    let rsiChart: any = null

    async function loadChartData() {
      setLoading(true)
      setError(null)
      setCallout(null)
      try {
        let chartData: any[] = []
        try {
          const res = await apiFetch(`/market-data?symbol=${encodeURIComponent(symbol)}&limit=100`) as any[]
          if (res && res.length >= 5) {
            const sorted = [...res].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            )
            chartData = sorted.map((d) => ({
              time: Math.floor(new Date(d.timestamp).getTime() / 1000) as any,
              open:  parseFloat(d.open),
              high:  parseFloat(d.high),
              low:   parseFloat(d.low),
              close: parseFloat(d.close),
              value: parseFloat(d.volume || 0),
              color: parseFloat(d.close) >= parseFloat(d.open) ? '#4fbf7a40' : '#e8604c40',
            }))
          }
        } catch (err) {
          console.error("Failed to load chart data:", err)
        }

        if (chartData.length < 5) {
          setError('Insufficient historical market data to render a price chart for this window.')
          setLoading(false)
          return
        }

        if (!active) return

        const closes = chartData.map(d => d.close)
        const smaValues = computeSMA(closes, 20)
        const smaLineData = chartData
          .map((d, i) => smaValues[i] !== null ? { time: d.time, value: smaValues[i] as number } : null)
          .filter(Boolean) as { time: any; value: number }[]

        const bbValues = computeBollingerBands(closes, 20, 2)
        const upperBands = chartData
          .map((d, i) => bbValues[i] !== null ? { time: d.time, value: bbValues[i]!.upper } : null)
          .filter(Boolean) as { time: any; value: number }[]
        const lowerBands = chartData
          .map((d, i) => bbValues[i] !== null ? { time: d.time, value: bbValues[i]!.lower } : null)
          .filter(Boolean) as { time: any; value: number }[]

        const rsiValues = computeRSI(closes, 14)
        const lastRsi = rsiValues.filter(v => v !== null).pop() ?? undefined

        const targetTime = Math.floor(new Date(marketTimestamp).getTime() / 1000)
        const closestIdx = chartData.reduce((bestI, curr, i) =>
          Math.abs(curr.time - targetTime) < Math.abs(chartData[bestI].time - targetTime) ? i : bestI
        , 0)
        const closest = chartData[closestIdx] || chartData[chartData.length - 1]
        const avgVol = chartData.reduce((s, d) => s + d.value, 0) / chartData.length
        const surgeFactor = avgVol > 0 ? Math.round((closest.value / avgVol) * 10) / 10 : 1.0

        const defaultCallout = {
          close: closest?.close ?? 0,
          volumeSurge: surgeFactor,
          rsi: lastRsi ? Math.round(lastRsi * 10) / 10 : undefined,
          isHover: false,
        }

        if (active && closest) {
          setCallout(defaultCallout)
        }

        if (chartContainerRef.current && active) {
          chartContainerRef.current.innerHTML = ''
          chart = createChart(chartContainerRef.current, {
            layout: {
              background: { type: 'solid' as any, color: '#12161a' },
              textColor: '#7c8790',
              fontFamily: 'IBM Plex Mono, monospace',
              // Attribution logo replaced with a text credit below the chart
              // per the Lightweight Charts / TradingView license.
              // Do not remove the footer credit if this flag remains false.
              attributionLogo: false,
            },
            grid: {
              vertLines: { color: '#232a31' },
              horzLines: { color: '#232a31' },
            },
            rightPriceScale: {
              scaleMargins: { top: 0.1, bottom: 0.25 },
              borderColor: '#232a31',
            },
            width: chartContainerRef.current.clientWidth || 340,
            height: 195,
            timeScale: {
              borderColor: '#232a31',
              timeVisible: true,
              secondsVisible: false,
            },
          })
          chartRef.current = chart

          const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor:      '#4fbf7a',
            downColor:    '#e8604c',
            borderVisible: false,
            wickUpColor:  '#4fbf7a',
            wickDownColor:'#e8604c',
          })
          candleSeries.setData(chartData)

          const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: '',
          })
          volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
          volumeSeries.setData(chartData)

          if (showSma && smaLineData.length > 0) {
            const smaSeries = chart.addSeries(LineSeries, {
              color:       '#7c8790',
              lineWidth:   1,
              lineStyle:   2,
              priceScaleId: 'right',
              lastValueVisible: false,
              priceLineVisible: false,
            })
            smaSeries.setData(smaLineData)
          }

          if (showBands && upperBands.length > 0) {
            const upperSeries = chart.addSeries(LineSeries, {
              color: '#d9a441',
              lineWidth: 1,
              lineStyle: 1,
              priceScaleId: 'right',
              lastValueVisible: false,
              priceLineVisible: false,
            })
            upperSeries.setData(upperBands)

            const lowerSeries = chart.addSeries(LineSeries, {
              color: '#d9a441',
              lineWidth: 1,
              lineStyle: 1,
              priceScaleId: 'right',
              lastValueVisible: false,
              priceLineVisible: false,
            })
            lowerSeries.setData(lowerBands)
          }

          const markerColor = severityColor(anomaly?.severity)
          const markerLabel = primaryPatternLabel(anomaly?.pattern_scores ?? null)
          
          let markers: any[] = []
          
          if (anomaly?.timeline && anomaly.timeline.length > 0) {
             const uniqueTimes = new Set();
             markers = anomaly.timeline.map((event) => {
                const targetTime = Math.floor(new Date(event.timestamp).getTime() / 1000)
                const closestIdx = chartData.reduce((bestI, curr, i) =>
                  Math.abs(curr.time - targetTime) < Math.abs(chartData[bestI].time - targetTime) ? i : bestI
                , 0)
                const matchedTime = chartData[closestIdx]?.time
                
                // Lightweight charts doesn't like multiple markers on the exact same time
                // We offset duplicate times slightly if needed, but since it's logical time,
                // we might just group them or pick the most important.
                // For now, we'll keep it simple and just use the exact time.
                // It actually allows multiple markers on the same time if they are in an array, 
                // but let's just make sure they render cleanly.
                
                let color = '#7c8790'
                let shape = 'circle'
                let text = ''
                
                if (event.event_type === 'MARKET_DATA') {
                  color = '#4fbf7a'; shape = 'arrowUp'; text = 'MKT';
                } else if (event.event_type === 'EVIDENCE') {
                  color = '#d9a441'; shape = 'arrowDown'; text = 'EVD';
                } else if (event.event_type === 'DETECTION') {
                  color = markerColor; shape = 'arrowDown'; text = markerLabel;
                }
                
                return {
                  time: matchedTime,
                  position: event.event_type === 'MARKET_DATA' ? 'belowBar' : 'aboveBar',
                  color: color,
                  shape: shape,
                  text: text,
                }
             })
             
             // Sort markers by time as required by lightweight charts
             markers.sort((a, b) => a.time - b.time)
          } else {
            markers = [
              {
                time:     closest.time,
                position: 'aboveBar',
                color:    markerColor,
                shape:    'arrowDown',
                text:     markerLabel,
              },
            ]
          }
          
          createSeriesMarkers(candleSeries, markers)

          chart.timeScale().fitContent()

          chart.subscribeCrosshairMove((param: any) => {
            if (!active) return;
            if (param.point === undefined || !param.time || param.point.x < 0 || param.point.x > chartContainerRef.current!.clientWidth || param.point.y < 0 || param.point.y > chartContainerRef.current!.clientHeight) {
              setCallout(defaultCallout);
              if (rsiChart) rsiChart.clearCrosshairPosition();
            } else {
              const candleData = param.seriesData.get(candleSeries) as any;
              if (candleData) {
                 const currentAvgVol = chartData.reduce((s, d) => s + d.value, 0) / chartData.length;
                 const currentSurge = currentAvgVol > 0 ? Math.round(((candleData.value ?? candleData.close) / currentAvgVol) * 10) / 10 : 1.0;
                 
                 const rsiIdx = chartData.findIndex(d => d.time === param.time);
                 const cRsi = rsiIdx >= 0 && rsiValues[rsiIdx] !== null ? Math.round(rsiValues[rsiIdx]! * 10) / 10 : undefined;

                 setCallout({
                   close: candleData.close ?? candleData.value,
                   volumeSurge: currentSurge,
                   rsi: cRsi,
                   isHover: true,
                 });
              }
            }
          });

          if (showRsi && rsiContainerRef.current) {
            rsiContainerRef.current.innerHTML = '';
            rsiChart = createChart(rsiContainerRef.current, {
              layout: {
                background: { type: 'solid' as any, color: '#12161a' },
                textColor: '#7c8790',
                fontFamily: 'IBM Plex Mono, monospace',
                attributionLogo: false,
              },
              grid: {
                vertLines: { color: '#232a31' },
                horzLines: { color: '#232a31' },
              },
              rightPriceScale: {
                borderColor: '#232a31',
              },
              width: rsiContainerRef.current.clientWidth || 340,
              height: 80,
              timeScale: {
                borderColor: '#232a31',
                timeVisible: true,
                secondsVisible: false,
              },
            });
            rsiChartRef.current = rsiChart

            const rsiSeries = rsiChart.addSeries(LineSeries, {
              color: '#9f85ff',
              lineWidth: 1.5,
              priceScaleId: 'right',
            });
            const rsiDataForChart = chartData
              .map((d, i) => rsiValues[i] !== null ? { time: d.time, value: rsiValues[i] as number } : null)
              .filter(Boolean) as { time: any; value: number }[];
            rsiSeries.setData(rsiDataForChart);

            rsiSeries.createPriceLine({ price: 70, color: '#e8604c80', lineWidth: 1, lineStyle: 2 });
            rsiSeries.createPriceLine({ price: 30, color: '#4fbf7a80', lineWidth: 1, lineStyle: 2 });

            rsiChart.timeScale().fitContent();

            const timeScale1 = chart.timeScale();
            const timeScale2 = rsiChart.timeScale();
            
            timeScale1.subscribeVisibleLogicalRangeChange((timeRange: any) => {
              if (timeRange) timeScale2.setVisibleLogicalRange(timeRange);
            });
            timeScale2.subscribeVisibleLogicalRangeChange((timeRange: any) => {
              if (timeRange) timeScale1.setVisibleLogicalRange(timeRange);
            });

            rsiChart.subscribeCrosshairMove((param: any) => {
              if (!active) return;
              if (param.point === undefined || !param.time || param.point.x < 0 || param.point.x > rsiContainerRef.current!.clientWidth || param.point.y < 0 || param.point.y > rsiContainerRef.current!.clientHeight) {
                setCallout(defaultCallout);
                chart.clearCrosshairPosition();
              } else {
                 const rsiData = param.seriesData.get(rsiSeries) as any;
                 const idx = chartData.findIndex(d => d.time === param.time);
                 if (idx >= 0) {
                    const cData = chartData[idx];
                    const currentAvgVol = chartData.reduce((s, d) => s + d.value, 0) / chartData.length;
                    const currentSurge = currentAvgVol > 0 ? Math.round((cData.value / currentAvgVol) * 10) / 10 : 1.0;
                    setCallout({
                      close: cData.close,
                      volumeSurge: currentSurge,
                      rsi: rsiData ? Math.round(rsiData.value * 10) / 10 : undefined,
                      isHover: true,
                    });
                 }
              }
            });
          }
        }
        setLoading(false)
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'Failed to load chart')
          setLoading(false)
        }
      }
    }

    loadChartData()

    const handleResize = () => {
      if (chart && chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
      if (rsiChart && rsiContainerRef.current) {
        rsiChart.applyOptions({ width: rsiContainerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      active = false
      window.removeEventListener('resize', handleResize)
      if (chart) chart.remove()
      if (rsiChart) rsiChart.remove()
    }
  }, [symbol, marketTimestamp, anomaly, showSma, showBands, showRsi])

  const markerColor = severityColor(anomaly?.severity)
  const patternLabel = primaryPatternLabel(anomaly?.pattern_scores ?? null)

  return (
    <div className="relative border border-line bg-surface p-2.5 rounded">
      {/* Header row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            Price History ({symbol})
          </span>
          {/* Indicator toggles */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                 if (chartRef.current) chartRef.current.timeScale().fitContent();
                 if (rsiChartRef.current) rsiChartRef.current.timeScale().fitContent();
              }}
              className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-line text-ink-faint hover:text-ink transition-colors mr-2"
              title="Reset Zoom"
            >
              RESET ZOOM
            </button>
            <button
              onClick={() => setShowSma(!showSma)}
              className={`font-mono text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                showSma ? 'bg-accent-dim/30 text-accent border-accent/40 font-semibold' : 'text-ink-faint border-line hover:text-ink'
              }`}
              title="Toggle 20-period Simple Moving Average"
            >
              SMA
            </button>
            <button
              onClick={() => setShowBands(!showBands)}
              className={`font-mono text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                showBands ? 'bg-warn-dim/30 text-warn border-warn/40 font-semibold' : 'text-ink-faint border-line hover:text-ink'
              }`}
              title="Toggle Bollinger Bands (20, 2)"
            >
              BOLL
            </button>
            <button
              onClick={() => setShowRsi(!showRsi)}
              className={`font-mono text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                showRsi ? 'bg-accent-dim/30 text-accent border-accent/40 font-semibold' : 'text-ink-faint border-line hover:text-ink'
              }`}
              title="Toggle RSI Indicator"
            >
              RSI
            </button>
          </div>
        </div>

        {callout && !loading && (
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span
              className="rounded border px-1.5 py-0.5 font-semibold uppercase tracking-wider"
              style={{ color: markerColor, borderColor: `${markerColor}40`, background: `${markerColor}10` }}
            >
              {patternLabel}
            </span>
            <span className="text-ink-faint">
              Close <span className="text-ink tabular">{callout.close.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            </span>
            {showRsi && callout.rsi !== undefined && (
              <span className={`tabular font-medium ${callout.rsi > 70 ? 'text-down' : callout.rsi < 30 ? 'text-up' : 'text-ink-dim'}`}>
                RSI:{callout.rsi}
              </span>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex h-[180px] items-center justify-center font-mono text-[11px] text-ink-faint">
          Loading price chart…
        </div>
      )}
      {error && !loading && (
        <div className="flex h-[180px] w-full items-center justify-center font-mono text-[11px] text-ink-faint">
          {error}
        </div>
      )}
      <div className={loading || error ? 'invisible h-0' : 'visible w-full flex flex-col gap-1'}>
        <div
          ref={chartContainerRef}
          className="w-full"
        />
        {showRsi && (
          <div
            ref={rsiContainerRef}
            className="w-full"
          />
        )}
        {/* TradingView attribution — required by the Lightweight Charts license
            when attributionLogo is set to false on the chart instances above. */}
        <div className="pt-0.5 text-right font-mono text-[9px] text-ink-faint">
          Charts by{' '}
          <a
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted hover:text-ink-dim"
          >
            TradingView
          </a>
        </div>
      </div>
    </div>
  )
}


/** Severity badge — color coded per Phase 0 tokens */
function SeverityBadge({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    CRITICAL: 'bg-down/15 text-down border-down/40',
    HIGH: 'bg-down-dim/20 text-down border-down-dim/40',
    MEDIUM: 'bg-accent-dim/20 text-accent border-accent-dim/40',
    LOW: 'bg-raised/50 text-ink-dim border-line',
  }
  const classes = colorMap[severity] ?? colorMap.LOW

  return (
    <span className={`inline-flex items-center justify-center rounded border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${classes}`}>
      {severity}
    </span>
  )
}

/** Parse pattern_scores from the raw JSON string the backend stores. */
function parsePatternScores(raw: string | null): Record<string, number> {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function AnomalyDetail({ anomaly, cases, onClose, onCaseUpdated, onSelectAnomaly }: AnomalyDetailProps) {
  const patterns = parsePatternScores(anomaly.pattern_scores)
  const severity = anomaly.severity
  const [actionLoading, setActionLoading] = useState(false)
  const { timezone } = useSettings()

  // Find if this anomaly is associated with any case
  const associatedCase = cases.find(c => c.anomaly_ids && c.anomaly_ids.includes(anomaly.id))

  const handleCreateCase = async () => {
    setActionLoading(true)
    try {
      await apiFetch('/cases', {
        method: 'POST',
        body: JSON.stringify({
          title: `Investigation for ${anomaly.symbol} Anomaly #${anomaly.id}`,
          anomaly_ids: [anomaly.id]
        })
      })
      onCaseUpdated()
    } catch (err) {
      console.error('Failed to create case', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateCaseStatus = async (caseId: number, nextStatus: string) => {
    setActionLoading(true)
    try {
      await apiFetch(`/cases/${caseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      })
      onCaseUpdated()
    } catch (err) {
      console.error('Failed to update case status', err)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-line bg-surface select-none animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          {associatedCase && <span className="font-mono text-[11px] font-semibold text-accent pr-2 border-r border-line">CASE-{associatedCase.id}</span>}
          <span className="font-mono text-[13px] font-medium text-ink">{anomaly.symbol}</span>
          {severity && <SeverityBadge severity={severity} />}
          <span className="font-mono text-[10px] text-ink-faint ml-1">{anomaly.market}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-ink-faint transition-colors hover:bg-raised hover:text-ink cursor-pointer"
          aria-label="Close detail panel"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        <AnomalyChart symbol={anomaly.symbol} marketTimestamp={anomaly.market_timestamp} anomaly={anomaly} />

        {/* Summary metrics */}
        <CollapsibleSection title="Detection Summary" storageKey="heimdall_col_detection_summary">
          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 mt-2">
            <dt className="font-mono text-[10px] text-ink-faint truncate">Anomaly Confidence</dt>
            <dd className="font-mono text-[11px] tabular">
              <SignalStrength 
                score={anomaly.anomaly_score} 
                size="sm"
              />
            </dd>
            <MetricRow label="Is Anomaly" value={anomaly.is_anomaly ? 'YES' : 'NO'} />
            <MetricRow
              label="Isolation Forest"
              value={anomaly.isolation_forest_score?.toFixed(4) ?? '—'}
            />
            <MetricRow
              label="Multi-Pattern Max"
              value={anomaly.multi_pattern_max_score?.toFixed(4) ?? '—'}
            />
            <MetricRow label="Market" value={anomaly.market} />
            <MetricRow label="Model Version" value={anomaly.model_version ?? '—'} />
            {anomaly.detector_agreement != null && (
              <MetricRow
                label="Detector Agreement"
                value={anomaly.detector_agreement === 1.0 ? 'BOTH AGREE' : 'PARTIAL'}
              />
            )}
            {anomaly.weak_label_confidence != null && (
              <MetricRow
                label="Attribution Confidence"
                value={`${(anomaly.weak_label_confidence * 100).toFixed(1)}%`}
              />
            )}
          </dl>
        </CollapsibleSection>

        {/* Pattern breakdown — the "not a black box" signal */}
        {Object.keys(patterns).length > 0 && (
          <CollapsibleSection title="Pattern Scores" storageKey="heimdall_col_pattern_scores">
            <div className="mt-2 space-y-2">
              {Object.entries(patterns)
                .sort(([, a], [, b]) => b - a)
                .map(([pattern, score]) => (
                  <div key={pattern} className="flex items-center gap-3">
                    <span className="w-32 truncate font-mono text-[11px] text-ink-dim">
                      {pattern}
                    </span>
                    <div className="flex-1 text-[11px] font-mono tracking-[0.1em] text-ink-faint select-none">
                      {Array.from({ length: 8 }).map((_, i) => {
                        const filled = i < Math.round(score * 8);
                        const colorClass = score >= 0.8 ? 'text-down' : score >= 0.5 ? 'text-accent' : 'text-ink-dim';
                        return <span key={i} className={filled ? colorClass : 'opacity-30'}>{filled ? '■' : '□'}</span>
                      })}
                    </div>
                    <span className={`w-14 text-right font-mono text-[11px] tabular ${score >= 0.8 ? 'text-down font-bold' : score >= 0.5 ? 'text-accent font-medium' : 'text-ink-dim'}`}>
                      {(score * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </CollapsibleSection>
        )}


        {anomaly.evidence && anomaly.evidence.length > 0 && (
          <CollapsibleSection title="Evidence Signals" storageKey="heimdall_col_evidence_signals">
            <EvidencePanel signals={anomaly.evidence} />
          </CollapsibleSection>
        )}

        {/* Investigation Timeline */}
        {anomaly.timeline && anomaly.timeline.length > 0 ? (
          <CollapsibleSection title="Investigation Timeline" storageKey="heimdall_col_timeline">
            <InvestigationTimeline events={anomaly.timeline} timezone={timezone} />
          </CollapsibleSection>
        ) : (
          <CollapsibleSection title="Timestamps" storageKey="heimdall_col_timestamps">
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between font-mono text-[10px] gap-2">
                <dt className="text-ink-faint truncate">Market</dt>
                <dd className="text-ink-dim tabular truncate">{formatDt(anomaly.market_timestamp, timezone)}</dd>
              </div>
              <div className="flex justify-between font-mono text-[10px] gap-2">
                <dt className="text-ink-faint truncate">Detected</dt>
                <dd className="text-ink-dim tabular truncate">{formatDt(anomaly.detected_at, timezone)}</dd>
              </div>
            </dl>
          </CollapsibleSection>
        )}

        {/* Related Alerts */}
        <CollapsibleSection title={`Related Alerts (${anomaly.symbol})`} storageKey="heimdall_col_related_alerts">
          <RelatedAlerts currentId={anomaly.id} symbol={anomaly.symbol} onSelectAnomaly={onSelectAnomaly} />
        </CollapsibleSection>

        {/* Correlated Markets */}
        <CollapsibleSection title="Correlated Markets" storageKey="heimdall_col_correlated_markets">
          <CorrelatedMarkets symbol={anomaly.symbol} />
        </CollapsibleSection>

        {/* Incident Management Workflow (Phases B2-B5) */}
        <CollapsibleSection title="Incident Workflow" storageKey="heimdall_col_incident_workflow" className="border-t border-line pt-4">
          {associatedCase ? (
            <div className="mt-2 space-y-3 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-ink-faint">CASE ID</span>
                <span className="text-accent font-medium">CASE-{associatedCase.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">TITLE</span>
                <span className="text-ink-dim truncate max-w-[200px]" title={associatedCase.title}>
                  {associatedCase.title}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">STATUS</span>
                <span className={`font-semibold rounded px-1.5 py-0.5 border ${
                  associatedCase.status === 'OPEN' ? 'text-down bg-down/10 border-down/20' :
                  associatedCase.status === 'IN_REVIEW' ? 'text-accent bg-accent/10 border-accent/20' :
                  associatedCase.status === 'ESCALATED' ? 'text-down font-bold bg-down/20 border-down/30 animate-pulse' :
                  'text-ink-dim bg-raised border-line'
                }`}>
                  {associatedCase.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2">
                {associatedCase.status === 'OPEN' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateCaseStatus(associatedCase.id, 'IN_REVIEW')}
                    className="rounded bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    START REVIEW
                  </button>
                )}
                {associatedCase.status === 'IN_REVIEW' && (
                  <>
                    <button
                      disabled={actionLoading}
                      onClick={() => handleUpdateCaseStatus(associatedCase.id, 'ESCALATED')}
                      className="rounded bg-down/10 border border-down/30 text-down hover:bg-down/20 px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      ESCALATE
                    </button>
                    <button
                      disabled={actionLoading}
                      onClick={() => handleUpdateCaseStatus(associatedCase.id, 'CLOSED')}
                      className="rounded bg-surface border border-line hover:bg-raised text-ink-dim px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      RESOLVE/CLOSE
                    </button>
                  </>
                )}
                {(associatedCase.status === 'DISMISSED' || associatedCase.status === 'CLOSED' || associatedCase.status === 'ESCALATED') && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateCaseStatus(associatedCase.id, 'OPEN')}
                    className="rounded bg-surface border border-line hover:bg-raised text-ink-dim px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    REOPEN CASE
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 font-mono text-[11px] text-ink-faint flex flex-col gap-2">
              <p>No active case is investigating this anomaly.</p>
              <button
                disabled={actionLoading}
                onClick={handleCreateCase}
                className="w-full rounded bg-accent border border-accent text-void hover:bg-accent-dim hover:border-accent-dim px-4 py-2 font-mono text-[11px] font-medium tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
              >
                START INVESTIGATION
              </button>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}

/* ── Investigation Timeline ────────────────────────────────────────────── */

function InvestigationTimeline({ events, timezone }: { events: any[], timezone: 'local' | 'utc' }) {
  return (
    <div className="mt-4 relative">
      <div className="absolute left-[11px] top-2 bottom-2 w-[1px] bg-line" />
      <div className="space-y-4">
        {events.map((event, i) => (
          <div key={i} className="relative pl-8">
            <div className={`absolute left-[7.5px] top-1.5 h-2 w-2 rounded-full border ${
              event.event_type === 'MARKET_DATA' ? 'bg-surface border-ink-dim' :
              event.event_type === 'EVIDENCE' ? 'bg-accent/20 border-accent' :
              'bg-down/20 border-down'
            }`} />
            
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[9px] text-ink-faint tabular">
                {formatDt(event.timestamp, timezone)}
              </span>
              <span className="font-mono text-[11px] font-medium text-ink-dim">
                {event.description}
              </span>
              {event.metadata && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(event.metadata).map(([k, v]) => (
                    <span key={k} className="font-mono text-[9px] text-ink-faint bg-raised/50 px-1.5 py-0.5 rounded border border-line">
                      {k}: <span className="text-ink-dim tabular">{typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Evidence panel ────────────────────────────────────────────────────── */

function EvidencePanel({ signals }: { signals: EvidenceSignal[] }) {
  return (
    <div className="mt-2 space-y-3">
      {signals.map((sig, i) => (
        <EvidenceBar 
          key={i}
          name={sig.name}
          observed={sig.value}
          threshold={sig.threshold}
          triggered={sig.triggered}
        />
      ))}
    </div>
  )
}

/* ── Related Alerts panel ──────────────────────────────────────────────── */

function RelatedAlerts({ currentId, symbol, onSelectAnomaly }: { currentId: number; symbol: string; onSelectAnomaly?: (anomaly: AnomalyListItem) => void }) {
  const { timezone } = useSettings()
  const [alerts, setAlerts] = useState<AnomalyListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function fetchRelated() {
      try {
        const res = await apiFetch(`/anomalies?symbol=${encodeURIComponent(symbol)}&limit=6`) as any
        if (active) {
          // Filter out the current one
          const related = (res.items || []).filter((a: AnomalyListItem) => a.id !== currentId).slice(0, 5)
          setAlerts(related)
        }
      } catch (err) {
        console.error('Failed to fetch related alerts', err)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchRelated()
    return () => { active = false }
  }, [symbol, currentId])

  if (loading) {
    return (
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-[34px] w-full" />
        <Skeleton className="h-[34px] w-full" />
        <Skeleton className="h-[34px] w-full" />
      </div>
    )
  }

  if (alerts.length === 0) {
    return <div className="mt-2 text-ink-faint font-mono text-[10px]">No related alerts found for {symbol}.</div>
  }

  return (
    <div className="mt-2 space-y-1.5">
      {alerts.map((a) => (
        <div 
          key={a.id} 
          onClick={() => onSelectAnomaly?.(a)}
          className="flex items-center justify-between border border-line bg-surface/50 rounded px-3 py-1.5 font-mono text-[11px] hover:bg-raised/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-ink-faint">#{a.id}</span>
            <span className="text-ink-dim truncate max-w-[150px]">{a.primary_signal || 'NORMAL'}</span>
          </div>
          <span className="text-ink-faint tabular text-[10px]">{formatDt(a.detected_at, timezone)}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Correlated Markets panel ────────────────────────────────────────────── */

function CorrelatedMarkets({ symbol }: { symbol: string }) {
  const [correlated, setCorrelated] = useState<{ symbol: string, score: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true;
    async function fetchCorrelation() {
      try {
        const universe = Array.from(new Set([symbol, 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'AAPL', 'TSLA', 'NVDA'])).join(',');
        const res = await apiFetch(`/market-data/correlation?symbols=${encodeURIComponent(universe)}&limit=60`) as any;
        
        if (active && res && res.symbols && res.matrix) {
          const idx = res.symbols.indexOf(symbol);
          if (idx !== -1) {
            const row = res.matrix[idx];
            const sorted = res.symbols
              .map((sym: string, i: number) => ({ symbol: sym, score: row[i] }))
              .filter((x: any) => x.symbol !== symbol && !isNaN(x.score))
              .sort((a: any, b: any) => Math.abs(b.score) - Math.abs(a.score))
              .slice(0, 5);
            setCorrelated(sorted);
          }
        }
      } catch (err) {
        console.error("Failed to fetch correlation", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchCorrelation();
    return () => { active = false };
  }, [symbol]);

  if (loading) {
    return (
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-[30px] w-full" />
        <Skeleton className="h-[30px] w-full" />
        <Skeleton className="h-[30px] w-full" />
      </div>
    )
  }

  if (correlated.length === 0) {
    return <div className="mt-2 text-ink-faint font-mono text-[10px]">No correlated assets found.</div>
  }

  return (
    <div className="mt-2 space-y-1.5">
      {correlated.map(c => (
        <div key={c.symbol} className="flex items-center justify-between font-mono text-[11px] border border-line bg-surface/50 px-3 py-1.5 rounded">
          <span className="text-ink-dim">{c.symbol}</span>
          <span className={`tabular ${c.score >= 0.7 ? 'text-accent font-medium' : c.score <= -0.7 ? 'text-warn font-medium' : 'text-ink-faint'}`}>
            {c.score > 0 ? '+' : ''}{c.score.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Tiny helpers ──────────────────────────────────────────────── */



function MetricRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <>
      <dt className="font-mono text-[10px] text-ink-faint truncate">{label}</dt>
      <dd className={`font-mono text-[11px] tabular truncate ${highlight ? 'text-accent' : 'text-ink-dim'}`}>
        {value}
      </dd>
    </>
  )
}

function formatDt(ts: string, timezone: 'local' | 'utc'): string {
  return formatDate(ts, timezone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
