import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { api } from '../api'
import { useT, type Lang } from '../i18n'
import { useTheme } from '../theme'
import type { ConnectionStatus, SyncProgress } from '@shared/types'

const navKeys = ['dashboard', 'models', 'sessions'] as const

export function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useT()
  const { theme, setTheme } = useTheme()
  const [connection, setConnection] = useState<ConnectionStatus>({
    status: 'disconnected',
    port: 0
  })
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const unsub1 = api.onConnectionStatus((s) =>
      setConnection(s as ConnectionStatus)
    )
    const unsub2 = api.onSyncProgress((p) =>
      setSyncProgress(p as SyncProgress)
    )
    const unsub3 = api.onSyncComplete(() => setSyncProgress(null))

    api.connectionStatus().then((s) => setConnection(s as ConnectionStatus))

    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [])

  const statusText = {
    connected: t('status.connected'),
    connecting: t('status.connecting'),
    disconnected: t('status.disconnected'),
  }

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <h1>opencode<span>Bar</span></h1>
        </div>

        <div className="sidebar-nav">
          {navKeys.map((key) => (
            <NavLink
              key={key}
              to={`/${key}`}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              <span className="nav-icon">
                {key === 'dashboard' ? '◫' : key === 'models' ? '⊞' : '☰'}
              </span>
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: '0 10px', marginTop: 'auto' }}>
          <button
            className="btn"
            style={{ width: '100%', justifyContent: 'center', padding: '6px 12px', fontSize: 'var(--text-xs)' }}
            onClick={() => setShowSettings(true)}
          >
            &#9881; {t('nav.settings')}
          </button>
        </div>

        <div className="sidebar-status">
          <div className={`status-dot ${connection.status}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {statusText[connection.status] ?? connection.status}
            </div>
            {connection.error && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', marginTop: 2, wordBreak: 'break-all' }}>
                {connection.error}
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="main-content">
        {syncProgress && (
          <div className="sync-bar">
            <span>{t('sync.syncingProgress', { current: syncProgress.current, total: syncProgress.total })}</span>
            <span style={{ color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {syncProgress.sessionTitle}
            </span>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
        {children}
      </main>

      {showSettings && (
        <SettingsPanel
          lang={lang}
          onSetLang={setLang}
          theme={theme}
          onSetTheme={setTheme}
          onClose={() => setShowSettings(false)}
          t={t}
        />
      )}
    </div>
  )
}

function SettingsPanel({
  lang,
  onSetLang,
  theme,
  onSetTheme,
  onClose,
  t,
}: {
  lang: Lang
  onSetLang: (l: Lang) => void
  theme: 'dark' | 'light'
  onSetTheme: (th: 'dark' | 'light') => void
  onClose: () => void
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const [syncOnStart, setSyncOnStart] = useState(true)
  const [dbPath, setDbPath] = useState('')
  const [dbAvailable, setDbAvailable] = useState(false)

  useEffect(() => {
    api.settings.get().then((s) => {
      setSyncOnStart(s.syncOnStart ?? true)
      setDbPath(s.dbPath ?? '')
    })
    api.dbPath.available().then(setDbAvailable)
  }, [])

  const handleAutoDetect = async () => {
    const detected = await api.dbPath.autoDetect()
    if (detected) {
      setDbPath(detected)
      setDbAvailable(true)
      await api.dbPath.set(detected)
    }
  }

  const handleBrowse = async () => {
    const selected = await api.dialog.openFile({
      title: 'Select opencode.db',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    })
    if (selected) {
      setDbPath(selected)
      const available = await api.dbPath.set(selected)
      setDbAvailable(available.status === 'connected')
    }
  }

  const save = () => {
    api.settings.set({ syncOnStart, dbPath })
    onClose()
  }

  const pathStatusColor = dbAvailable ? 'var(--success)' : 'var(--error)'
  const pathStatusText = dbAvailable ? t('settings.dbFound') : t('settings.dbNotFound')

  return (
    <div className="detail-panel" style={{ right: 0 }}>
      <div className="detail-header">
        <h3>{t('settings.title')}</h3>
        <button className="detail-close" onClick={onClose}>×</button>
      </div>
      <div className="detail-body">
        {/* Database Path */}
        <div className="settings-section">
          <h3>{t('settings.database')}</h3>
          <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: '100%' }}>
              <div className="setting-label">{t('settings.dbPath')}</div>
              <div className="setting-desc">{t('settings.dbPathDesc')}</div>
            </div>
            <div
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                wordBreak: 'break-all',
                lineHeight: 1.5
              }}
            >
              {dbPath || t('settings.dbNotSet')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)' }}>
              <span style={{ color: pathStatusColor, fontWeight: 600 }}>{pathStatusText}</span>
            </div>
            <div className="btn-group" style={{ width: '100%', marginTop: 4 }}>
              <button className="btn btn-small" onClick={handleAutoDetect}>
                {t('settings.autoDetect')}
              </button>
              <button className="btn btn-small" onClick={handleBrowse}>
                {t('settings.browse')}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>{t('settings.language')}</h3>
          <div className="setting-row">
            <div>
              <div className="setting-label">{t('settings.language')}</div>
              <div className="setting-desc">{t('settings.languageDesc')}</div>
            </div>
            <div className="btn-group">
              <button
                className={`btn btn-small ${lang === 'zh' ? 'btn-primary' : ''}`}
                onClick={() => onSetLang('zh')}
              >
                中文
              </button>
              <button
                className={`btn btn-small ${lang === 'en' ? 'btn-primary' : ''}`}
                onClick={() => onSetLang('en')}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>{t('settings.theme')}</h3>
          <div className="setting-row">
            <div>
              <div className="setting-label">{t('settings.theme')}</div>
              <div className="setting-desc">{t('settings.themeDesc')}</div>
            </div>
            <div className="btn-group">
              <button
                className={`btn btn-small ${theme === 'dark' ? 'btn-primary' : ''}`}
                onClick={() => onSetTheme('dark')}
              >
                {t('settings.dark')}
              </button>
              <button
                className={`btn btn-small ${theme === 'light' ? 'btn-primary' : ''}`}
                onClick={() => onSetTheme('light')}
              >
                {t('settings.light')}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>{t('settings.sync')}</h3>
          <div className="setting-row">
            <div>
              <div className="setting-label">{t('settings.syncOnConnect')}</div>
              <div className="setting-desc">{t('settings.syncDesc')}</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={syncOnStart}
                onChange={(e) => setSyncOnStart(e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>
        </div>

        <button className="btn btn-primary" onClick={save} style={{ width: '100%' }}>
          {t('settings.save')}
        </button>
      </div>
    </div>
  )
}
