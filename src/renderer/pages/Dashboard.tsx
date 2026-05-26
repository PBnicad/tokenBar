import { useEffect, useState } from 'react'
import dayjs from 'dayjs'

import { MiniHeatmap } from '../components/MiniHeatmap'
import { StackedBarChart, DonutChart, chartColors, formatCost, formatTokens } from '../components/DashboardCharts'
import { DateRangePicker, type DateRange } from '../components/DateRangePicker'
import { SourceDropdown } from '../components/SourceDropdown'
import { api } from '../api'
import { useT } from '../i18n'
import type { Overview, DailyUsageRow, ModelAggregation } from '@shared/types'
import type { HeatmapCellData } from '../components/MiniHeatmap'

export function Dashboard() {
  const { t } = useT()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [dailyUsage, setDailyUsage] = useState<DailyUsageRow[]>([])
  const [byModel, setByModel] = useState<ModelAggregation[]>([])
  const [calendarData, setCalendarData] = useState<HeatmapCellData[]>([])
  const [sourceFilter, setSourceFilter] = useState<string>('')

  const today = dayjs()
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: today.subtract(29, 'day').format('YYYY-MM-DD'),
    to: today.format('YYYY-MM-DD'),
  }))
  const calFrom = today.subtract(364, 'day').format('YYYY-MM-DD')
  const calTo = today.format('YYYY-MM-DD')

  const { from, to } = dateRange
  const src = sourceFilter || undefined

  useEffect(() => { loadData() }, [from, to, sourceFilter])

  // Listen for background data updates (sync, periodic aggregation)
  useEffect(() => {
    const unsub = api.onDataUpdated(() => loadData())
    return unsub
  }, [from, to, sourceFilter])

  const loadData = async () => {
    const [o, d, m, c] = await Promise.all([
      api.overview(src, from, to),
      api.dailyUsage(from, to, src),
      api.byModel(from, to, src),
      api.dailyTotals(calFrom, calTo, src)
    ])
    setOverview(o)
    setDailyUsage(d)
    setByModel(m)
    setCalendarData(c)
  }

  // Build cost bar chart data
  const dateMap = new Map<string, Record<string, number>>()
  const dateTokensMap = new Map<string, Record<string, number>>()
  const allModels = new Set<string>()

  for (const row of dailyUsage) {
    allModels.add(`${row.provider_id}/${row.model_id}`)
    if (!dateMap.has(row.date)) dateMap.set(row.date, {})
    if (!dateTokensMap.has(row.date)) dateTokensMap.set(row.date, {})
    dateMap.get(row.date)![`${row.provider_id}/${row.model_id}`] =
      (dateMap.get(row.date)![`${row.provider_id}/${row.model_id}`] ?? 0) + row.cost
    dateTokensMap.get(row.date)![`${row.provider_id}/${row.model_id}`] =
      (dateTokensMap.get(row.date)![`${row.provider_id}/${row.model_id}`] ?? 0) + row.tokens_total
  }

  const allDates = Array.from(dateMap.keys()).sort()
  const modelList = Array.from(allModels)

  const costBarData = allDates.map((date) => ({
    label: dayjs(date).format('MM/DD'),
    rawLabel: date,
    total: modelList.reduce((s, m) => s + (dateMap.get(date)![m] ?? 0), 0),
    segments: modelList.map((m, idx) => ({
      name: m,
      value: dateMap.get(date)![m] ?? 0,
      color: chartColors[idx % chartColors.length],
    })),
  }))

  const tokenBarData = allDates.map((date) => ({
    label: dayjs(date).format('MM/DD'),
    rawLabel: date,
    total: modelList.reduce((s, m) => s + (dateTokensMap.get(date)![m] ?? 0), 0),
    segments: modelList.map((m, idx) => ({
      name: m,
      value: dateTokensMap.get(date)![m] ?? 0,
      color: chartColors[idx % chartColors.length],
    })),
  }))

  const donutData = byModel.map((m, idx) => ({
    name: `${m.provider_id}/${m.model_id}`,
    value: m.cost,
    color: chartColors[idx % chartColors.length],
  }))

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('dashboard.title')}</h2>
        <p>{t('dashboard.subtitle')}</p>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <SourceDropdown
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { value: '', label: 'All agents' },
              { value: 'opencode', label: 'OpenCode' },
              { value: 'pi-agent', label: 'Pi Agent' },
            ]}
          />
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            presets={[
              { label: '7d', days: 7 },
              { label: '30d', days: 30 },
              { label: '90d', days: 90 },
            ]}
          />
        </div>
      </div>

      {overview && (
        <div className="overview-grid">
          <div className="overview-card">
            <div className="label">{t('dashboard.totalCost')}</div>
            <div className="value accent">{formatCost(overview.totalCost)}</div>
          </div>
          <div className="overview-card">
            <div className="label">{t('dashboard.totalTokens')}</div>
            <div className="value">{formatTokens(overview.totalTokens)}</div>
          </div>
          <div className="overview-card">
            <div className="label">{t('dashboard.totalSessions')}</div>
            <div className="value">{overview.totalSessions}</div>
          </div>
          <div className="overview-card">
            <div className="label">{t('dashboard.totalMessages')}</div>
            <div className="value">{overview.totalMessages}</div>
          </div>
          <div className="overview-card">
            <div className="label">{t('dashboard.modelsUsed')}</div>
            <div className="value">{overview.uniqueModels}</div>
          </div>
        </div>
      )}

      <div className="charts-grid">
        <div className="chart-section">
          <div className="chart-section-header">
            <h3>{t('dashboard.dailyCost')}</h3>
          </div>
          <div className="chart-container">
            {costBarData.length > 0 ? (
              <StackedBarChart data={costBarData} valueFormatter={formatCost} />
            ) : (
              <div className="empty-state" style={{ padding: '30px' }}><p>{t('dashboard.noData')}</p></div>
            )}
          </div>
        </div>

        <div className="chart-section">
          <div className="chart-section-header">
            <h3>{t('dashboard.dailyTokens')}</h3>
          </div>
          <div className="chart-container">
            {tokenBarData.length > 0 ? (
              <StackedBarChart data={tokenBarData} valueFormatter={formatTokens} />
            ) : (
              <div className="empty-state" style={{ padding: '30px' }}><p>{t('dashboard.noDataShort')}</p></div>
            )}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-section">
          <div className="chart-section-header">
            <h3>{t('dashboard.costByModel')}</h3>
          </div>
          <div className="chart-container">
            {donutData.length > 0 ? (
              <DonutChart data={donutData} valueFormatter={formatCost} />
            ) : (
              <div className="empty-state" style={{ padding: '30px' }}><p>{t('dashboard.noDataShort')}</p></div>
            )}
          </div>
        </div>

        {/* Token Contribution Heatmap */}
        <div className="chart-section" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-section-header">
            <h3>{t('dashboard.tokenHeatmap')}</h3>
          </div>
          <div className="chart-container">
            {calendarData.length > 0 ? (
              <MiniHeatmap
                data={calendarData}
                weeks={52}
                showLabels={true}
                cellSize={14}
              />
            ) : (
              <div className="empty-state" style={{ padding: '30px' }}><p>{t('dashboard.noDataShort')}</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
