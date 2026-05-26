import { useEffect, useState } from 'react'
import { api } from '../api'
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

function UsageBar({ label, window }: { label: string; window: OpenCodeGoWindow | null }) {
  if (!window) return null
  const pct = window.quotaPercent
  const color = pct > 80 ? 'var(--error)' : pct > 50 ? 'var(--warning)' : 'var(--success)'

  return (
    <div className="usage-card">
      <div className="usage-card-header">
        <span className="usage-card-label">{label}</span>
        <span className="usage-card-reset">resets in {formatReset(window.resetInSec)}</span>
      </div>
      <div className="usage-bar-track">
        <div
          className="usage-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="usage-card-pct" style={{ color }}>
        {pct}% used
      </div>
    </div>
  )
}

export function Usage() {
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
    api.opencodeGo.configured().then(setConfigured)
    fetchQuota()
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h2>OpenCode Go</h2>
        <p>Cloud subscription usage</p>
      </div>

      {!configured && (
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <p>OpenCode Go not configured. Add your workspace ID and auth cookie in Settings.</p>
        </div>
      )}

      {error && (
        <div className="update-bar" style={{ marginBottom: 16, borderRadius: 8 }}>
          <span>{error}</span>
          <button className="btn btn-small" onClick={fetchQuota}>Retry</button>
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading...</div>
      )}

      {data && (
        <div className="usage-grid">
          <UsageBar label="Rolling" window={data.rolling} />
          <UsageBar label="Weekly" window={data.weekly} />
          <UsageBar label="Monthly" window={data.monthly} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 16, gridColumn: '1 / -1' }}>
            Last updated: {new Date(data.fetchedAt).toLocaleString()}
            <button className="btn btn-small" style={{ marginLeft: 12 }} onClick={fetchQuota}>Refresh</button>
          </div>
        </div>
      )}
    </div>
  )
}
