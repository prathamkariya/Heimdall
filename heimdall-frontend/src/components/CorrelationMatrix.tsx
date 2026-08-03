import { useState, useEffect, useRef } from 'react'
import { TrendingUp, RefreshCw } from 'lucide-react'
import { apiFetch } from '../lib/api'

const SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'AAPL', 'TSLA', 'NVDA']
const SHORT_LABELS: Record<string, string> = {
  'BTC-USDT': 'BTC',
  'ETH-USDT': 'ETH',
  'SOL-USDT': 'SOL',
  'BNB-USDT': 'BNB',
  'AAPL': 'AAPL',
  'TSLA': 'TSLA',
  'NVDA': 'NVDA',
}
const MARKET_LABELS: Record<string, 'CRYPTO' | 'EQ'> = {
  'BTC-USDT': 'CRYPTO',
  'ETH-USDT': 'CRYPTO',
  'SOL-USDT': 'CRYPTO',
  'BNB-USDT': 'CRYPTO',
  'AAPL': 'EQ',
  'TSLA': 'EQ',
  'NVDA': 'EQ',
}

type CorrelationMatrix = Record<string, Record<string, number>>

interface TooltipState {
  x: number
  y: number
  row: string
  col: string
  value: number
}

function getCellColor(r: number, isDiagonal: boolean): string {
  if (isDiagonal) return 'bg-accent/20 border border-accent/30'
  if (r >= 0.7) return 'bg-up/25 text-up'
  if (r >= 0.4) return 'bg-up/10 text-up/70'
  if (r >= 0.1) return 'bg-line/60 text-ink-faint'
  if (r >= -0.1) return 'bg-void text-ink-faint'
  if (r >= -0.4) return 'bg-down/10 text-down/70'
  return 'bg-down/25 text-down'
}

function getCellIntensity(r: number): string {
  const abs = Math.abs(r)
  if (abs >= 0.7) return 'opacity-100'
  if (abs >= 0.4) return 'opacity-80'
  if (abs >= 0.15) return 'opacity-60'
  return 'opacity-40'
}

/** Fallback: generate plausible synthetic correlation matrix when no live data available */
function syntheticMatrix(): CorrelationMatrix {
  const base: Record<string, Record<string, number>> = {
    'BTC-USDT': { 'BTC-USDT': 1, 'ETH-USDT': 0.88, 'SOL-USDT': 0.76, 'BNB-USDT': 0.71, 'AAPL': 0.23, 'TSLA': 0.31, 'NVDA': 0.27 },
    'ETH-USDT': { 'BTC-USDT': 0.88, 'ETH-USDT': 1, 'SOL-USDT': 0.82, 'BNB-USDT': 0.74, 'AAPL': 0.19, 'TSLA': 0.28, 'NVDA': 0.24 },
    'SOL-USDT': { 'BTC-USDT': 0.76, 'ETH-USDT': 0.82, 'SOL-USDT': 1, 'BNB-USDT': 0.68, 'AAPL': 0.12, 'TSLA': 0.22, 'NVDA': 0.18 },
    'BNB-USDT': { 'BTC-USDT': 0.71, 'ETH-USDT': 0.74, 'SOL-USDT': 0.68, 'BNB-USDT': 1, 'AAPL': 0.08, 'TSLA': 0.15, 'NVDA': 0.11 },
    'AAPL':     { 'BTC-USDT': 0.23, 'ETH-USDT': 0.19, 'SOL-USDT': 0.12, 'BNB-USDT': 0.08, 'AAPL': 1, 'TSLA': 0.56, 'NVDA': 0.71 },
    'TSLA':     { 'BTC-USDT': 0.31, 'ETH-USDT': 0.28, 'SOL-USDT': 0.22, 'BNB-USDT': 0.15, 'AAPL': 0.56, 'TSLA': 1, 'NVDA': 0.48 },
    'NVDA':     { 'BTC-USDT': 0.27, 'ETH-USDT': 0.24, 'SOL-USDT': 0.18, 'BNB-USDT': 0.11, 'AAPL': 0.71, 'TSLA': 0.48, 'NVDA': 1 },
  }
  return base
}

interface CorrelationMatrixProps {
  className?: string
}

export function CorrelationMatrix({ className = '' }: CorrelationMatrixProps) {
  const [matrix, setMatrix] = useState<CorrelationMatrix | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isSynthetic, setIsSynthetic] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const buildFromApi = async () => {
    setLoading(true)
    try {
      // Direct call to backend correlation endpoint
      const res = await apiFetch(`/market-data/correlation?symbols=${encodeURIComponent(SYMBOLS.join(','))}&limit=60`) as {
        symbols: string[]
        matrix: number[][]
        sample_count: number
      }

      if (res && res.symbols && res.matrix && res.symbols.length >= 2) {
        const matrixObj: CorrelationMatrix = {}
        res.symbols.forEach((symA, i) => {
          matrixObj[symA] = {}
          res.symbols.forEach((symB, j) => {
            matrixObj[symA][symB] = res.matrix[i][j]
          })
        })
        setMatrix(matrixObj)
        setIsSynthetic(false)
      } else {
        setMatrix(syntheticMatrix())
        setIsSynthetic(true)
      }
    } catch {
      // Fallback to client-side synthesis when DB has sparse records
      setMatrix(syntheticMatrix())
      setIsSynthetic(true)
    } finally {
      setLoading(false)
      setLastUpdated(new Date())
    }
  }

  useEffect(() => {
    buildFromApi()
    // Refresh every 5 minutes
    const iv = setInterval(buildFromApi, 5 * 60 * 1000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const displaySymbols = matrix ? Object.keys(matrix).filter(s => SYMBOLS.includes(s)) : SYMBOLS

  return (
    <div className={`bg-surface border border-line rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-void/40">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-accent" />
          <span className="font-mono text-[11px] font-semibold text-ink uppercase tracking-wider">
            Cross-Asset Correlation
          </span>
          {isSynthetic && (
            <span className="text-[9px] font-mono text-ink-faint bg-line/40 px-1.5 py-0.5 rounded">SYNTHETIC</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[9px] font-mono text-ink-faint">
              Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={buildFromApi}
            disabled={loading}
            className="text-ink-faint hover:text-ink transition-fast cursor-pointer disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Matrix grid */}
      <div className="p-3 overflow-x-auto" ref={containerRef}>
        {matrix && (
          <table className="border-collapse" style={{ minWidth: `${displaySymbols.length * 52 + 72}px` }}>
            <thead>
              <tr>
                <th className="w-16" />
                {displaySymbols.map(col => (
                  <th key={col} className="pb-2 px-0.5">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-mono text-[10px] text-ink-faint font-medium">
                        {SHORT_LABELS[col] ?? col}
                      </span>
                      <span className={`text-[8px] font-mono px-1 rounded ${
                        MARKET_LABELS[col] === 'CRYPTO'
                          ? 'text-accent/70 bg-accent/8'
                          : 'text-up/70 bg-up/8'
                      }`}>
                        {MARKET_LABELS[col]}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displaySymbols.map(row => (
                <tr key={row}>
                  <td className="pr-2 py-0.5">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-[10px] text-ink-faint font-medium whitespace-nowrap">
                        {SHORT_LABELS[row] ?? row}
                      </span>
                      <span className={`text-[8px] font-mono px-1 rounded ${
                        MARKET_LABELS[row] === 'CRYPTO'
                          ? 'text-accent/70 bg-accent/8'
                          : 'text-up/70 bg-up/8'
                      }`}>
                        {MARKET_LABELS[row]}
                      </span>
                    </div>
                  </td>
                  {displaySymbols.map(col => {
                    const r = matrix[row]?.[col] ?? 0
                    const isDiag = row === col
                    return (
                      <td key={col} className="p-0.5">
                        <div
                          className={`correlation-cell w-11 h-9 flex items-center justify-center rounded cursor-pointer text-[11px] font-mono font-semibold ${getCellColor(r, isDiag)} ${getCellIntensity(r)}`}
                          onMouseEnter={(e) => {
                            const rect = (e.target as HTMLElement).getBoundingClientRect()
                            setTooltip({ x: rect.left, y: rect.bottom + 4, row, col, value: r })
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {isDiag ? '—' : r.toFixed(2)}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 pb-3 pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-up/25" />
          <span className="text-[9px] font-mono text-ink-faint">Strong positive (≥0.7)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-line/60" />
          <span className="text-[9px] font-mono text-ink-faint">Neutral</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-down/25" />
          <span className="text-[9px] font-mono text-ink-faint">Inverse (≤−0.4)</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-void border border-line rounded-lg p-3 shadow-xl pointer-events-none animate-fade-in"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-mono text-[10px] text-ink-faint mb-1">
            {SHORT_LABELS[tooltip.row]} ↔ {SHORT_LABELS[tooltip.col]}
          </div>
          <div className={`text-lg font-mono font-bold ${
            tooltip.value >= 0.5 ? 'text-up' : tooltip.value <= -0.3 ? 'text-down' : 'text-ink'
          }`}>
            r = {tooltip.value.toFixed(3)}
          </div>
          <div className="text-[9px] font-mono text-ink-faint mt-1">
            {tooltip.value >= 0.7
              ? 'Strong positive co-movement'
              : tooltip.value >= 0.4
                ? 'Moderate positive correlation'
                : tooltip.value >= -0.1
                  ? 'Near-zero / uncorrelated'
                  : tooltip.value >= -0.4
                    ? 'Moderate inverse correlation'
                    : 'Strong inverse co-movement'}
          </div>
          {Math.abs(tooltip.value) >= 0.65 && tooltip.row !== tooltip.col && (
            <div className="text-[9px] font-mono text-accent mt-1.5 border-t border-line/40 pt-1.5">
              ⚠ High correlation — potential contagion risk
            </div>
          )}
        </div>
      )}
    </div>
  )
}
