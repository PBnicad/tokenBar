import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { api } from '../api'
import { useT, type Lang } from '../i18n'
import { useTheme } from '../theme'
import { TitleBar } from './TitleBar'
import { SourceDropdown } from './SourceDropdown'
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
      <TitleBar />
      <div className="shell-body">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <h1><span>token</span>Bar</h1>
        </div>

        <div className="sidebar-nav">
          {navKeys.map((key) => (
            <NavLink
              key={key}
              to={`/${key}`}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              <span className="nav-icon">
                {key === 'dashboard' ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <rect x="1" y="1" width="5" height="5" rx="1" />
                    <rect x="8" y="1" width="5" height="5" rx="1" />
                    <rect x="1" y="8" width="5" height="5" rx="1" />
                    <rect x="8" y="8" width="5" height="5" rx="1" />
                  </svg>
                ) : key === 'models' ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <circle cx="4" cy="5" r="2.5" />
                    <circle cx="10" cy="4" r="2" />
                    <circle cx="7" cy="10" r="3" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <line x1="2" y1="3" x2="12" y2="3" />
                    <line x1="2" y1="7" x2="12" y2="7" />
                    <line x1="2" y1="11" x2="8" y2="11" />
                  </svg>
                )}
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
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ marginRight: 4, flexShrink: 0 }}>
              <circle cx="7" cy="7" r="3" />
              <path d="M7 1.5v1.3M7 11.2v1.3M1.5 7h1.3M11.2 7h1.3M3.1 3.1l.9.9M10 10l.9.9M3.1 10.9l.9-.9M10 4l.9-.9" />
            </svg>
            {t('nav.settings')}
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
      </div>{/* shell-body */}
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
  const [opencodePath, setOpencodePath] = useState('')
  const [opencodeAvail, setOpencodeAvail] = useState(false)
  const [piPath, setPiPath] = useState('')
  const [piAvail, setPiAvail] = useState(false)

  useEffect(() => {
    api.settings.get().then((s) => {
      setSyncOnStart(s.syncOnStart ?? true)
      setOpencodePath(s.dbPath ?? '')
      setPiPath(s.piAgentSessionDir ?? '')
    })
    api.agentConfig.isAvailable('opencode').then((a: boolean) => setOpencodeAvail(a))
    api.agentConfig.isAvailable('pi-agent').then((a: boolean) => setPiAvail(a))
  }, [])

  const save = () => {
    api.settings.set({ syncOnStart, dbPath: opencodePath, piAgentSessionDir: piPath })
    api.agentConfig.setPath('opencode', opencodePath)
    api.agentConfig.setPath('pi-agent', piPath)
    onClose()
  }

  return (
    <div className="detail-panel" style={{ right: 0 }}>
      <div className="detail-header">
        <h3>{t('settings.title')}</h3>
        <button className="detail-close" onClick={onClose}>×</button>
      </div>
      <div className="detail-body">

        {/* ── Data Sources ── */}
        <div className="settings-section">
          <h3>{t('settings.dataSources')}</h3>
          <p className="settings-section-desc">
            {t('settings.dataSourcesDesc')}
          </p>

          <AgentSourceCard
            name="OpenCode"
            icon={<AgentDbIcon />}
            desc="SQLite database (opencode.db)"
            path={opencodePath}
            available={opencodeAvail}
            placeholder="~/.local/share/opencode/opencode.db"
            onBrowse={async () => {
              const f = await api.dialog.openFile({ title: 'Select opencode.db', filters: [{ name: 'SQLite Database', extensions: ['db'] }] })
              if (f) { setOpencodePath(f); await api.agentConfig.setPath('opencode', f); setOpencodeAvail(true) }
            }}
            onAutoDetect={async () => {
              await api.agentConfig.setPath('opencode', '')
              setOpencodePath('')
              const a = await api.agentConfig.isAvailable('opencode')
              setOpencodeAvail(a)
            }}
            connectedLabel={t('settings.agentConnected')}
            notFoundLabel={t('settings.agentNotFound')}
            autoDetectLabel={t('settings.autoDetect')}
            browseLabel={t('settings.browse')}
          />

          <AgentSourceCard
            name="Pi Agent"
            icon={<AgentFileIcon />}
            desc="JSONL session files"
            path={piPath}
            available={piAvail}
            placeholder="~/.pi/agent/sessions"
            onBrowse={async () => {
              const f = await api.dialog.openFolder({ title: 'Select Pi Agent sessions folder' })
              if (f) { setPiPath(f); await api.agentConfig.setPath('pi-agent', f); setPiAvail(true) }
            }}
            onAutoDetect={async () => {
              await api.agentConfig.setPath('pi-agent', '')
              setPiPath('')
              const a = await api.agentConfig.isAvailable('pi-agent')
              setPiAvail(a)
            }}
            connectedLabel={t('settings.agentConnected')}
            notFoundLabel={t('settings.agentNotFound')}
            autoDetectLabel={t('settings.autoDetect')}
            browseLabel={t('settings.browse')}
          />
        </div>

        {/* ── Appearance ── */}
        <div className="settings-section">
          <h3>{t('settings.appearance')}</h3>

          <div className="setting-row">
            <div>
              <div className="setting-label">{t('settings.language')}</div>
            </div>
            <SourceDropdown
              value={lang}
              onChange={(v) => onSetLang(v as Lang)}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">{t('settings.theme')}</div>
            </div>
            <SourceDropdown
              value={theme}
              onChange={(v) => onSetTheme(v as 'dark' | 'light')}
              options={[
                { value: 'dark', label: t('settings.dark') },
                { value: 'light', label: t('settings.light') },
              ]}
            />
          </div>
        </div>

        {/* ── Sync ── */}
        <div className="settings-section">
          <h3>{t('settings.sync')}</h3>
          <div className="setting-row">
            <div>
              <div className="setting-label">{t('settings.syncOnConnect')}</div>
              <div className="setting-desc">{t('settings.syncDesc')}</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={syncOnStart} onChange={(e) => setSyncOnStart(e.target.checked)} />
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

/* ── Agent source card (inline sub-component) ── */

function AgentSourceCard({
  name, icon, desc, path, available, placeholder, onBrowse, onAutoDetect,
  connectedLabel, notFoundLabel, autoDetectLabel, browseLabel,
}: {
  name: string
  icon: React.ReactNode
  desc: string
  path: string
  available: boolean
  placeholder: string
  onBrowse: () => void
  onAutoDetect: () => void
  connectedLabel: string
  notFoundLabel: string
  autoDetectLabel: string
  browseLabel: string
}) {
  const dotColor = available ? 'var(--success)' : 'var(--text-tertiary)'
  const statusText = available ? connectedLabel : notFoundLabel

  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <span className="agent-card-icon">{icon}</span>
        <div className="agent-card-info">
          <span className="agent-card-name">{name}</span>
          <span className="agent-card-desc">{desc}</span>
        </div>
        <div className="agent-card-status">
          <span className="agent-card-dot" style={{ background: dotColor }} />
          <span style={{ fontSize: 'var(--text-xs)', color: available ? 'var(--success)' : 'var(--text-tertiary)' }}>{statusText}</span>
        </div>
      </div>
      <div className="agent-card-body">
        <div className="agent-card-path">
          {path || placeholder}
        </div>
        <div className="btn-group" style={{ marginTop: 8 }}>
          <button className="btn btn-small" onClick={onAutoDetect}>{autoDetectLabel}</button>
          <button className="btn btn-small" onClick={onBrowse}>{browseLabel}</button>
        </div>
      </div>
    </div>
  )
}

function AgentDbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.6">
      <ellipse cx="8" cy="3.5" rx="6" ry="2.5" />
      <path d="M2 3.5v4.5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V3.5" />
      <path d="M2 8v4.5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V8" />
    </svg>
  )
}

function AgentFileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.6">
      <path d="M3 1.5h6.5l4 4v9a1 1 0 01-1 1h-9.5a1 1 0 01-1-1v-13a1 1 0 011-1z" />
      <path d="M9.5 1.5v4h4" />
      <line x1="5" y1="9" x2="11" y2="9" />
      <line x1="5" y1="11.5" x2="9" y2="11.5" />
    </svg>
  )
}

