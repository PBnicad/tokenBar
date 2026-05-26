import { useEffect, useState } from 'react'
import { api } from '../api'
import { useT } from '../i18n'
import type { OpenCodeGoSnapshot, OpenCodeGoWindow } from '../../main/adapters/opencode-go'

function formatReset(seconds: number): string {
  if (seconds <= 0) return 'now'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
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
    </div>
  )
}
