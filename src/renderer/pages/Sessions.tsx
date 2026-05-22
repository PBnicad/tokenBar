import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api'
import { useT } from '../i18n'
import type { SessionListItem, SessionDetail } from '@shared/types'

function formatCost(v: number) { return `$${v.toFixed(4)}` }
function formatTokens(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

export function Sessions() {
  const { t } = useT()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const limit = 20

  useEffect(() => { loadSessions() }, [page, search])

  const loadSessions = async () => {
    const result = await api.sessionList({ page, limit, search: search || undefined })
    setSessions(result.sessions)
    setTotal(result.total)
  }

  const openDetail = async (id: string) => {
    const d = await api.sessionDetail(id)
    setDetail(d)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('sessions.title')}</h2>
        <p>{t('sessions.subtitle', { total })}</p>
      </div>

      <div className="session-controls">
        <input
          className="search-input"
          placeholder={t('sessions.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      <table className="session-table">
        <thead>
          <tr>
            <th>{t('sessions.titleCol')}</th>
            <th>{t('sessions.model')}</th>
            <th>{t('sessions.cost')}</th>
            <th>{t('sessions.tokens')}</th>
            <th>{t('sessions.messages')}</th>
            <th>{t('sessions.date')}</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} onClick={() => openDetail(s.id)}>
              <td style={{ color: 'var(--text-primary)' }}>{s.title}</td>
              <td style={{ color: 'var(--accent-text)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                {s.model_id || t('sessions.unknown')}
              </td>
              <td className="mono">{formatCost(s.cost)}</td>
              <td className="mono">{formatTokens(s.tokens_total)}</td>
              <td>{s.message_count}</td>
              <td style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                {dayjs(s.created_at).format('MM/DD HH:mm')}
              </td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                {t('sessions.noSessions')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('sessions.prev')}</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('sessions.next')}</button>
        </div>
      )}

      {detail && (
        <div className="detail-panel">
          <div className="detail-header">
            <h3>{detail.session.title}</h3>
            <button className="detail-close" onClick={() => setDetail(null)}>×</button>
          </div>
          <div className="detail-body">
            <div className="detail-stats">
              <div className="detail-stat">
                <div className="label">{t('sessions.totalCost')}</div>
                <div className="value" style={{ color: 'var(--accent-text)' }}>{formatCost(detail.totalCost)}</div>
              </div>
              <div className="detail-stat">
                <div className="label">{t('sessions.totalTokens')}</div>
                <div className="value">{formatTokens(detail.totalTokens)}</div>
              </div>
              <div className="detail-stat">
                <div className="label">{t('sessions.messages')}</div>
                <div className="value">{detail.messages.length}</div>
              </div>
              <div className="detail-stat">
                <div className="label">{t('sessions.directory')}</div>
                <div className="value" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
                  {detail.session.directory.split(/[\\/]/).pop() || detail.session.directory}
                </div>
              </div>
            </div>

            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
              {t('sessions.messagesSection')}
            </h4>

            <div className="message-timeline">
              {detail.messages.map((msg) => (
                <div key={msg.id} className="message-item">
                  <div className="msg-header">
                    <span className="msg-model">{msg.model_id}</span>
                    <span className="msg-time">
                      {msg.created_at > 0 ? dayjs(msg.created_at).format('MM/DD HH:mm:ss') : '-'}
                    </span>
                  </div>
                  <div className="msg-tokens">
                    <div className="msg-token">
                      <span className="t-label">{t('sessions.input')}</span>
                      <span className="t-value">{formatTokens(msg.tokens_input)}</span>
                    </div>
                    <div className="msg-token">
                      <span className="t-label">{t('sessions.output')}</span>
                      <span className="t-value">{formatTokens(msg.tokens_output)}</span>
                    </div>
                    <div className="msg-token">
                      <span className="t-label">{t('common.cost')}</span>
                      <span className="t-value" style={{ color: 'var(--accent-text)' }}>
                        {formatCost(msg.cost)}
                      </span>
                    </div>
                    <div className="msg-token">
                      <span className="t-label">{t('sessions.reasoning')}</span>
                      <span className="t-value">{formatTokens(msg.tokens_reasoning)}</span>
                    </div>
                    <div className="msg-token">
                      <span className="t-label">{t('sessions.cacheRead')}</span>
                      <span className="t-value">{formatTokens(msg.tokens_cache_read)}</span>
                    </div>
                    <div className="msg-token">
                      <span className="t-label">{t('sessions.cacheWrite')}</span>
                      <span className="t-value">{formatTokens(msg.tokens_cache_write)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
