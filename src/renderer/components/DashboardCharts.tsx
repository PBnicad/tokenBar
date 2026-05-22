import { useState, useCallback } from 'react'
import dayjs from 'dayjs'

const chartColors = ['#e8a840', '#5e9cf5', '#3ecf8e', '#f3565e', '#b06fff', '#40c4d8', '#ff8a65', '#a0d468']

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function formatCost(v: number): string {
  return `$${v.toFixed(4)}`
}

/* ────────────────────── Tooltip ────────────────────── */

interface TooltipState {
  x: number
  y: number
  content: React.ReactNode
}

function ChartTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  if (!tooltip) return null
  return (
    <div
      className="chart-tooltip"
      style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
    >
      <div className="chart-tooltip-arrow" />
      <div className="chart-tooltip-body">{tooltip.content}</div>
    </div>
  )
}

/* ────────────────────── StackedBarChart ────────────────────── */

interface BarDatum {
  label: string
  rawLabel: string
  segments: { value: number; color: string; name: string }[]
  total: number
}

interface StackedBarChartProps {
  data: BarDatum[]
  valueFormatter?: (v: number) => string
  height?: number
}

export function StackedBarChart({ data, valueFormatter = String, height = 240 }: StackedBarChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const maxTotal = Math.max(1, ...data.map((d) => d.total))

  const handleEnter = useCallback(
    (datum: BarDatum, e: React.MouseEvent) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      setTooltip({
        x: rect.left + rect.width / 2,
        y: rect.top - 6,
        content: (
          <>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
              {datum.rawLabel}
            </div>
            {datum.segments
              .filter((s) => s.value > 0)
              .map((s, i) => (
                <div key={i} className="chart-tooltip-row">
                  <span className="chart-tooltip-dot" style={{ background: s.color }} />
                  <span className="chart-tooltip-label">{s.name}</span>
                  <span className="chart-tooltip-value">{valueFormatter(s.value)}</span>
                </div>
              ))}
            <div className="chart-tooltip-divider" />
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-label" style={{ fontWeight: 600 }}>Total</span>
              <span className="chart-tooltip-value" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {valueFormatter(datum.total)}
              </span>
            </div>
          </>
        ),
      })
    },
    [valueFormatter]
  )

  const handleLeave = useCallback(() => setTooltip(null), [])

  if (data.length === 0) return null

  const showLabelEvery = data.length > 30 ? Math.ceil(data.length / 8) : data.length > 14 ? Math.ceil(data.length / 7) : 1

  return (
    <div className="stacked-bar-chart" style={{ height }}>
      <div className="stacked-bar-area">
        {data.map((datum, i) => (
          <div key={i} className="bar-column" style={{ flex: 1 }}>
            <div className="bar-stack" style={{ height: `${(datum.total / maxTotal) * 100}%` }}>
              {datum.segments
                .filter((s) => s.value > 0)
                .map((s, j) => (
                  <div
                    key={j}
                    className="bar-segment"
                    style={{
                      flexGrow: s.value,
                      background: s.color,
                    }}
                    onMouseEnter={(e) => handleEnter(datum, e)}
                    onMouseLeave={handleLeave}
                  />
                ))}
            </div>
            <div className="bar-xlabel">
              {i % showLabelEvery === 0 ? datum.label : ''}
            </div>
          </div>
        ))}
      </div>
      <ChartTooltip tooltip={tooltip} />
    </div>
  )
}

/* ────────────────────── DonutChart ────────────────────── */

interface DonutDatum {
  name: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutDatum[]
  valueFormatter?: (v: number) => string
  height?: number
}

export function DonutChart({ data, valueFormatter = String, height = 300 }: DonutChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const total = data.reduce((s, d) => s + d.value, 0)
  const cx = 100
  const cy = 100
  const r = 80
  const r2 = 52

  let acc = 0
  const slices = data.map((d, i) => {
    const startAngle = (acc / total) * 360
    const sweepAngle = (d.value / total) * 360
    acc += d.value
    return { ...d, startAngle, sweepAngle, index: i }
  })

  const handleEnter = useCallback(
    (d: DonutDatum, idx: number, e: React.MouseEvent) => {
      setActiveIdx(idx)
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      setTooltip({
        x: rect.left + rect.width / 2,
        y: rect.top - 6,
        content: (
          <>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 'var(--text-xs)' }}>
              {d.name}
            </div>
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-label">Value</span>
              <span className="chart-tooltip-value">{valueFormatter(d.value)}</span>
            </div>
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-label">Share</span>
              <span className="chart-tooltip-value">
                {total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : '0%'}
              </span>
            </div>
          </>
        ),
      })
    },
    [valueFormatter, total]
  )

  const handleLeave = useCallback(() => {
    setActiveIdx(null)
    setTooltip(null)
  }, [])

  const circumference = 2 * Math.PI * r        // outer ring length
  const strokeWidth = r - r2                    // ring thickness
  let dashOffset = 0

  return (
    <div className="donut-chart" style={{ height }}>
      <div className="donut-chart-body">
        <svg viewBox="0 0 200 200" className="donut-svg">
          {slices.map((s) => {
            if (s.sweepAngle <= 0) return null
            const arcLen = (s.sweepAngle / 360) * circumference
            const gapLen = circumference - arcLen
            const prevOffset = dashOffset
            dashOffset -= arcLen

            return (
              <circle
                key={s.index}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={activeIdx === s.index ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={`${arcLen} ${gapLen}`}
                strokeDashoffset={prevOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
                opacity={activeIdx !== null && activeIdx !== s.index ? 0.4 : 1}
                style={{
                  transition: 'opacity 150ms ease, stroke-width 150ms ease',
                  cursor: 'pointer',
                  strokeLinecap: 'butt',
                }}
                onMouseEnter={(e) => handleEnter(s, s.index, e)}
                onMouseLeave={handleLeave}
              />
            )
          })}
          {/* inner mask to create donut hole */}
          <circle cx={cx} cy={cy} r={r2} style={{ fill: 'var(--donut-center-bg)' }} />
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fontWeight="700" style={{ fill: 'var(--donut-center-text)' }}>
            {valueFormatter(total)}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" style={{ fill: 'var(--donut-center-label)' }}>
            Total
          </text>
        </svg>

        <div className="donut-legend">
          {data.map((d, i) => (
            <div
              key={i}
              className={`donut-legend-item ${activeIdx === i ? 'active' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={handleLeave}
            >
              <span className="donut-legend-dot" style={{ background: d.color }} />
              <span className="donut-legend-name">{d.name}</span>
              <span className="donut-legend-value">{total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : '0%'}</span>
            </div>
          ))}
        </div>
      </div>
      <ChartTooltip tooltip={tooltip} />
    </div>
  )
}

/* ────────────────────── Helpers ────────────────────── */

export { chartColors, formatTokens, formatCost }
