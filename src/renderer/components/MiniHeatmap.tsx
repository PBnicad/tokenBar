import { useState, useCallback, useRef, useLayoutEffect } from 'react'
import dayjs from 'dayjs'

const chartColors = ['#e8a840', '#5e9cf5', '#3ecf8e', '#f3565e', '#b06fff', '#40c4d8', '#ff8a65', '#a0d468']

export interface HeatmapCellData {
  date: string
  tokens: number
  input?: number
  output?: number
  reasoning?: number
  cache_read?: number
  cache_write?: number
  cost?: number
  messages?: number
}

export interface MiniHeatmapProps {
  data: HeatmapCellData[]
  color?: string
  weeks?: number
  showLabels?: boolean
  cellSize?: number
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function getIntensity(tokens: number, maxTokens: number): number {
  if (tokens <= 0 || maxTokens <= 0) return 0
  const ratio = tokens / maxTokens
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

export function MiniHeatmap({
  data,
  color,
  weeks = 26,
  showLabels = true,
  cellSize = 10
}: MiniHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    cell: HeatmapCellData
    x: number
    y: number
  } | null>(null)

  const maxTokens = Math.max(1, ...data.map((d) => d.tokens))
  const dataMap = new Map(data.map((d) => [d.date, d]))

  const today = dayjs()
  const currentMonday = today.subtract((today.day() + 6) % 7, 'day')
  const startMonday = currentMonday.subtract((weeks - 1) * 7, 'day')

  const cellsByWeek: HeatmapCellData[][] = []
  for (let w = 0; w < weeks; w++) {
    const week: HeatmapCellData[] = []
    for (let d = 0; d < 7; d++) {
      const date = startMonday.add(w * 7 + d, 'day')
      const dateStr = date.format('YYYY-MM-DD')
      week.push(dataMap.get(dateStr) ?? { date: dateStr, tokens: 0 })
    }
    cellsByWeek.push(week)
  }

  const flatCells = cellsByWeek.flat()
  if (flatCells.length === 0) return null

  const handleMouseEnter = useCallback((cell: HeatmapCellData, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setTooltip({
      cell,
      x: rect.left + rect.width / 2,
      y: rect.top - 8
    })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  return (
    <>
      <div className="mini-heatmap-wrapper" style={{ '--cell-size': `${cellSize}px` } as React.CSSProperties}>
        {showLabels && (
          <div className="mini-heatmap-labels">
            {['M', '', 'W', '', 'F', '', ''].map((label, i) => (
              <div key={i} className={`label ${label ? '' : 'empty'}`}>{label}</div>
            ))}
          </div>
        )}
        <div className="mini-heatmap-grid">
          {flatCells.map((cell, i) => {
            const intensity = getIntensity(cell.tokens, maxTokens)
            const cellStyle: React.CSSProperties = {}
            if (color && cell.tokens > 0) {
              const opacityMap: Record<number, number> = { 0: 0, 1: 0.25, 2: 0.45, 3: 0.7, 4: 1 }
              cellStyle.backgroundColor = color
              cellStyle.opacity = opacityMap[intensity] ?? 0.3
              cellStyle.borderColor = 'transparent'
            }
            return (
              <div
                key={i}
                className={`mini-heatmap-cell l${intensity}`}
                style={cellStyle}
                onMouseEnter={(e) => handleMouseEnter(cell, e)}
                onMouseLeave={handleMouseLeave}
              />
            )
          })}
        </div>
      </div>

      {tooltip && (
        <HeatmapTooltip
          cell={tooltip.cell}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}
    </>
  )
}

function clampTooltip(el: HTMLElement, anchorX: number, anchorY: number, gap: number = 8) {
  const rect = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const halfW = rect.width / 2

  let left = anchorX
  let top = anchorY
  let tx = '-50%'
  let ty = '-100%'

  // Horizontal: keep within viewport, small padding from edges
  if (anchorX - halfW < gap) {
    left = gap
    tx = '0'
  } else if (anchorX + halfW > vw - gap) {
    left = vw - gap
    tx = '-100%'
  }

  // Vertical: flip below anchor if too close to top edge
  if (anchorY - rect.height < gap) {
    top = anchorY + gap
    ty = '0'
  }

  el.style.left = `${left}px`
  el.style.top = `${top}px`
  el.style.transform = `translate(${tx}, ${ty})`
}

function HeatmapTooltip({ cell, x, y }: {
  cell: HeatmapCellData
  x: number
  y: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isEmpty = cell.tokens === 0
  const weekDay = dayjs(cell.date).format('ddd')
  const dateStr = dayjs(cell.date).format('YYYY-MM-DD')

  useLayoutEffect(() => {
    if (ref.current) clampTooltip(ref.current, x, y)
  }, [x, y])

  return (
    <div
      ref={ref}
      className="heatmap-tooltip"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div className="heatmap-tooltip-arrow" />
      <div className="heatmap-tooltip-content">
        <div className="heatmap-tooltip-header">
          <span className="heatmap-tooltip-date">{dateStr}</span>
          <span className="heatmap-tooltip-weekday">{weekDay}</span>
        </div>

        {isEmpty ? (
          <div className="heatmap-tooltip-row">
            <span className="heatmap-tooltip-label">No contributions</span>
          </div>
        ) : (
          <>
            <div className="heatmap-tooltip-row highlight">
              <span className="heatmap-tooltip-label">Total tokens</span>
              <span className="heatmap-tooltip-value">{formatTokens(cell.tokens)}</span>
            </div>

            <div className="heatmap-tooltip-divider" />

            <div className="heatmap-tooltip-row">
              <span className="heatmap-tooltip-label">Input</span>
              <span className="heatmap-tooltip-value">{formatTokens(cell.input ?? 0)}</span>
            </div>
            <div className="heatmap-tooltip-row">
              <span className="heatmap-tooltip-label">Output</span>
              <span className="heatmap-tooltip-value">{formatTokens(cell.output ?? 0)}</span>
            </div>

            {(cell.reasoning ?? 0) > 0 && (
              <div className="heatmap-tooltip-row">
                <span className="heatmap-tooltip-label">Reasoning</span>
                <span className="heatmap-tooltip-value">{formatTokens(cell.reasoning ?? 0)}</span>
              </div>
            )}

            <div className="heatmap-tooltip-divider" />

            <div className="heatmap-tooltip-row">
              <span className="heatmap-tooltip-label">Cache read</span>
              <span className="heatmap-tooltip-value accent">{formatTokens(cell.cache_read ?? 0)}</span>
            </div>
            {(cell.cache_write ?? 0) > 0 && (
              <div className="heatmap-tooltip-row">
                <span className="heatmap-tooltip-label">Cache write</span>
                <span className="heatmap-tooltip-value accent">{formatTokens(cell.cache_write ?? 0)}</span>
              </div>
            )}

            {(cell.cost ?? 0) > 0 && (
              <div className="heatmap-tooltip-row">
                <span className="heatmap-tooltip-label">Cost</span>
                <span className="heatmap-tooltip-value">${(cell.cost ?? 0).toFixed(4)}</span>
              </div>
            )}

            {(cell.messages ?? 0) > 0 && (
              <div className="heatmap-tooltip-row">
                <span className="heatmap-tooltip-label">Messages</span>
                <span className="heatmap-tooltip-value">{cell.messages}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function ModelHeatmapCard({
  modelId,
  modelIndex,
  cost,
  tokens,
  messageCount,
  data,
  t
}: {
  modelId: string
  modelIndex: number
  cost: number
  tokens: number
  messageCount: number
  from: string
  today: string
  data: HeatmapCellData[]
  t: (k: string, v?: Record<string, string | number>) => string
}) {
  const color = chartColors[modelIndex % chartColors.length]

  return (
    <div className="heatmap-cell">
      <div className="model-card-header">
        <div className="model-card-title">
          <span className="model-name" style={{ color }}>{modelId}</span>
          <span className="model-cost">{formatCost(cost)}</span>
        </div>
        <div className="model-stats">
          <span>{t('models.tokens')}: {formatTokens(tokens)}</span>
          <span>{t('models.messages')}: {messageCount}</span>
        </div>
      </div>

      {data.length > 0 ? (
        <MiniHeatmap data={data} color={color} weeks={26} showLabels={true} />
      ) : (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>{t('dashboard.noDataShort')}</span>
        </div>
      )}
    </div>
  )
}

function formatCost(v: number) { return `$${v.toFixed(4)}` }
