import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { MiniHeatmap, ModelHeatmapCard, type HeatmapCellData } from '../components/MiniHeatmap'
import { SourceDropdown } from '../components/SourceDropdown'
import { api } from '../api'
import { useT } from '../i18n'
import type { ModelAggregation } from '@shared/types'

export function Models() {
  const { t } = useT()
  const [byModel, setByModel] = useState<ModelAggregation[]>([])
  const [modelDailyData, setModelDailyData] = useState<Record<string, HeatmapCellData[]>>({})
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const rangeDays = 180

  const today = dayjs().format('YYYY-MM-DD')
  const from = dayjs().subtract(rangeDays - 1, 'day').format('YYYY-MM-DD')
  const src = sourceFilter || undefined

  useEffect(() => { loadModels() }, [sourceFilter])

  // Listen for background data updates
  useEffect(() => {
    const unsub = api.onDataUpdated(() => loadModels())
    return unsub
  }, [sourceFilter])

  const loadModels = async () => {
    const models = await api.byModel(from, today, src)
    setByModel(models)

    // Fetch daily totals for each model in parallel
    const dataMap: Record<string, HeatmapCellData[]> = {}
    await Promise.all(
      models.map(async (m) => {
        const totals = await api.modelDailyTotals(from, today, m.model_id, src)
        dataMap[m.model_id] = totals
      })
    )
    setModelDailyData(dataMap)
  }

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h2>{t('models.title')}</h2>
        <p>{t('models.subtitle')}</p>
        <div style={{ marginTop: 8 }}>
          <SourceDropdown
            value={sourceFilter}
            onChange={(v) => { setSourceFilter(v) }}
            options={[
              { value: '', label: 'All agents' },
              { value: 'opencode', label: 'OpenCode' },
              { value: 'pi-agent', label: 'Pi Agent' },
            ]}
          />
        </div>
      </div>

      <div className="chart-section-header" style={{ marginBottom: 16 }}>
        <h3>{t('models.perModelHeatmaps')}</h3>
      </div>

      <div className="heatmap-grid">
        {byModel.map((m, idx) => (
          <ModelHeatmapCard
            key={`${m.provider_id}/${m.model_id}`}
            modelId={m.model_id}
            modelIndex={idx}
            cost={m.cost}
            tokens={m.tokens_total}
            messageCount={m.message_count}
            from={from}
            today={today}
            data={modelDailyData[m.model_id] ?? []}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
