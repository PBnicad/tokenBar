import { useEffect, useState, useMemo } from 'react'
import { api } from '../api'
import { useT } from '../i18n'
import { MiniHeatmap } from '../components/MiniHeatmap'
import type { HeatmapCellData } from '../components/MiniHeatmap'
import type { OpenCodeGoSnapshot, OpenCodeGoWindow, OpenCodeGoUsageRecord } from '../../main/adapters/opencode-go'

function formatReset(seconds: number): string {
  if (seconds <= 0) return 'now'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function UsageBar({ label, window, t }: {
  label: string
  window: OpenCodeGoWindow | null
  t: (k: string) => string
}) {
  if (!window) return null
  const pct = window.quotaPercent
  const color = pct > 80 ? 'var(--error)' : pct > 50 ? 'var(--warning)' : 'var(--success)'

  return (
    <div className="usage-card">
      <div className="usage-card-header">
        <span className="usage-card-label">{label}</span>
        <span className="usage-card-reset">{t('usage.resetsIn')} {formatReset(window.resetInSec)}</span>
      </div>
      <div className="usage-bar-track">
        <div
          className="usage-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="usage-card-pct" style={{ color }}>
        {pct}% {t('usage.used')}
      </div>
    </div>
  )
}

export function Usage() {
  const { t } = useT()
  const [data, setData] = useState<OpenCodeGoSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)

  const fetchQuota = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.opencodeGo.quota()
      if (result.error) {
        setError(result.error)
      } else {
        setData(result as OpenCodeGoSnapshot)
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }

  useEffect(() => {
    api.opencodeGo.configured().then((ok: boolean) => {
      setConfigured(ok)
      if (ok) fetchQuota()
    })
  }, [])

  // Build heatmap data from usage history
  const heatmapData = useMemo((): HeatmapCellData[] => {
    if (!data || data.usageHistory.length === 0) return []
    const byDate = new Map<string, { tokens: number; input: number; output: number; reasoning: number; cost: number; messages: number }>()
    for (const r of data.usageHistory) {
      const date = r.timeCreated.slice(0, 10)
      const entry = byDate.get(date) || { tokens: 0, input: 0, output: 0, reasoning: 0, cost: 0, messages: 0 }
      entry.tokens += r.inputTokens + r.outputTokens + r.reasoningTokens
      entry.input += r.inputTokens
      entry.output += r.outputTokens
      entry.reasoning += r.reasoningTokens
      entry.cost += r.cost
      entry.messages += 1
      byDate.set(date, entry)
    }
    return Array.from(byDate.entries()).map(([date, v]) => ({ date, ...v }))
  }, [data])

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('usage.title')}</h2>
        <p>{t('usage.subtitle')}</p>
      </div>

      {!configured && (
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <p>{t('usage.notConfigured')}</p>
        </div>
      )}

      {error && (
        <div className="update-bar" style={{ marginBottom: 16, borderRadius: 8 }}>
          <span>{error}</span>
          <button className="btn btn-small" onClick={fetchQuota}>{t('usage.retry')}</button>
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>{t('usage.loading')}</div>
      )}

      {data && (
        <div className="usage-grid">
          <UsageBar label="Rolling" window={data.rolling} t={t} />
          <UsageBar label="Weekly" window={data.weekly} t={t} />
          <UsageBar label="Monthly" window={data.monthly} t={t} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 16, gridColumn: '1 / -1' }}>
            {t('usage.lastUpdated')}: {new Date(data.fetchedAt).toLocaleString()}
            <button className="btn btn-small" style={{ marginLeft: 12 }} onClick={fetchQuota}>{t('usage.refresh')}</button>
          </div>
        </div>
      )}

      {data && data.usageHistory.length > 0 && (
        <div style={{ maxWidth: 900, marginTop: 32 }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 12 }}>Activity</h3>
          <MiniHeatmap data={heatmapData} weeks={20} showLabels={true} cellSize={12} />

          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: '28px 0 12px' }}>Usage History</h3>
          <table className="session-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Input</th>
                <th>Output</th>
                <th>Reasoning</th>
                <th>Cache</th>
                <th>Cost</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {data.usageHistory.map((r: OpenCodeGoUsageRecord) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--accent-text)' }}>
                    {r.model}
                  </td>
                  <td className="mono">{formatTokens(r.inputTokens)}</td>
                  <td className="mono">{formatTokens(r.outputTokens)}</td>
                  <td className="mono">{formatTokens(r.reasoningTokens)}</td>
                  <td className="mono">{formatTokens(r.cacheReadTokens)}</td>
                  <td className="mono" style={{ color: 'var(--accent-text)' }}>
                    ${(r.cost / 1000000).toFixed(4)}
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                    {new Date(r.timeCreated).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
