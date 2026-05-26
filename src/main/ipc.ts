import electron from 'electron'
import {
  getOverview,
  getDailyUsage,
  getByModel,
  getHeatmap,
  getDailyTotals,
  getModelDailyTotals,
  getSessionList,
  getSessionDetail
} from './db'
import { syncAllHistory } from './sync'
import { getAvailableAdapters } from './adapters/registry'
import { opencodeAdapter } from './adapters/opencode'
import { piAgentAdapter } from './adapters/pi-agent'
import type { ConnectionStatus, SettingsData, SyncProgressEvent } from '../shared/types'
import { getAppSetting, setAppSetting, getDbPath as getLocalDbPath } from './db'

const settings: SettingsData = {
  serverPort: 0,
  syncOnStart: true,
  dbPath: '',
  piAgentSessionDir: ''
}

export function registerIpcHandlers(): void {
  // ---- Connection ----

  electron.ipcMain.handle('connection:status', (): ConnectionStatus => {
    const adapters = getAvailableAdapters()
    const names = adapters.map((a) => a.displayName).join(', ')
    return {
      status: adapters.length > 0 ? 'connected' : 'disconnected',
      port: 0,
      error: adapters.length > 0 ? undefined : `No agent data sources found. Detected: ${names || 'none'}`
    }
  })

  electron.ipcMain.handle('connection:connect', async () => {
    if (settings.syncOnStart) {
      syncAllHistory((progress: SyncProgressEvent) => {
        for (const win of electron.BrowserWindow.getAllWindows()) {
          win.webContents.send('sync:progress', progress)
        }
      }).then(() => {
        for (const win of electron.BrowserWindow.getAllWindows()) {
          win.webContents.send('sync:complete')
        }
      })
    }
    const adapters = getAvailableAdapters()
    return {
      status: adapters.length > 0 ? 'connected' : 'disconnected',
      port: 0
    } as ConnectionStatus
  })

  electron.ipcMain.handle('connection:disconnect', async () => {
    return { status: 'disconnected', port: 0 } as ConnectionStatus
  })

  // ---- Agent config paths ----

  electron.ipcMain.handle('agent:getPath', (_event, agentName: string) => {
    return getAppSetting(`agent.${agentName}.path`) || ''
  })

  electron.ipcMain.handle('agent:setPath', (_event, { agentName, path }: { agentName: string; path: string }) => {
    setAppSetting(`agent.${agentName}.path`, path)
    // Clear adapter caches so they pick up the new path
    if (agentName === 'opencode') opencodeAdapter.dispose?.()
    return true
  })

  electron.ipcMain.handle('agent:isAvailable', (_event, agentName: string) => {
    if (agentName === 'opencode') return opencodeAdapter.isAvailable()
    if (agentName === 'pi-agent') return piAgentAdapter.isAvailable()
    return false
  })

  electron.ipcMain.handle('agent:detectPath', (_event, agentName: string) => {
    if (agentName === 'opencode') {
      const detected = opencodeAdapter.isAvailable()
      return detected ? getAppSetting('agent.opencode.path') || '(auto-detected)' : null
    }
    if (agentName === 'pi-agent') {
      if (piAgentAdapter.isAvailable()) return getAppSetting('agent.pi-agent.path') || '(auto-detected)'
      return null
    }
    return null
  })

  // ---- Database path (legacy, for backward compat with settings panel) ----

  electron.ipcMain.handle('db:path', () => getAppSetting('agent.opencode.path') || '')

  electron.ipcMain.handle('db:available', () => opencodeAdapter.isAvailable())

  electron.ipcMain.handle('db:setPath', (_event, filePath: string) => {
    setAppSetting('agent.opencode.path', filePath)
    opencodeAdapter.dispose?.()
    return { status: opencodeAdapter.isAvailable() ? 'connected' : 'disconnected' }
  })

  electron.ipcMain.handle('db:autoDetect', () => {
    return opencodeAdapter.isAvailable() ? getAppSetting('agent.opencode.path') || '(auto-detected)' : null
  })

  electron.ipcMain.handle('dialog:openFile', async (_event, opts: {
    title?: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
  }) => {
    const result = await electron.dialog.showOpenDialog({
      title: opts.title ?? 'Select File',
      defaultPath: opts.defaultPath,
      filters: opts.filters ?? [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
      properties: ['openFile']
    })
    return result.filePaths[0] ?? null
  })

  electron.ipcMain.handle('dialog:openFolder', async (_event, opts: { title?: string; defaultPath?: string }) => {
    const result = await electron.dialog.showOpenDialog({
      title: opts.title ?? 'Select Folder',
      defaultPath: opts.defaultPath,
      properties: ['openDirectory']
    })
    return result.filePaths[0] ?? null
  })

  // ---- Usage queries (support optional source filter) ----

  electron.ipcMain.handle('usage:overview', (_event, { source, from, to }: { source?: string; from?: string; to?: string }) =>
    getOverview(source, from, to)
  )

  electron.ipcMain.handle('usage:daily', (_event, { from, to, source }: { from: string; to: string; source?: string }) =>
    getDailyUsage(from, to, source)
  )

  electron.ipcMain.handle('usage:by-model', (_event, { from, to, source }: { from: string; to: string; source?: string }) =>
    getByModel(from, to, source)
  )

  electron.ipcMain.handle(
    'usage:heatmap',
    (_event, { from, to, source, modelId }: { from: string; to: string; source?: string; modelId?: string }) =>
      getHeatmap(from, to, source, modelId)
  )

  electron.ipcMain.handle(
    'usage:daily-totals',
    (_event, { from, to, source }: { from: string; to: string; source?: string }) =>
      getDailyTotals(from, to, source)
  )

  electron.ipcMain.handle(
    'usage:model-daily-totals',
    (_event, { from, to, modelId, source }: { from: string; to: string; modelId: string; source?: string }) =>
      getModelDailyTotals(from, to, modelId, source)
  )

  // ---- Sessions ----

  electron.ipcMain.handle(
    'sessions:list',
    (_event, params: { page: number; limit: number; search?: string; modelId?: string; source?: string }) =>
      getSessionList(params)
  )

  electron.ipcMain.handle('sessions:detail', (_event, { sessionId, source }: { sessionId: string; source?: string }) =>
    getSessionDetail(sessionId, source)
  )

  // ---- Sync ----

  electron.ipcMain.handle('sync:status', () => ({ syncing: false }))

  electron.ipcMain.handle('sync:now', async () => {
    syncAllHistory((progress: SyncProgressEvent) => {
      for (const win of electron.BrowserWindow.getAllWindows()) {
        win.webContents.send('sync:progress', progress)
      }
    }).then(() => {
      for (const win of electron.BrowserWindow.getAllWindows()) {
        win.webContents.send('sync:complete')
      }
    })
  })

  // ---- Settings ----

  electron.ipcMain.handle('settings:get', () => ({
    ...settings,
    dbPath: getAppSetting('agent.opencode.path') || getLocalDbPath(),
    piAgentSessionDir: getAppSetting('agent.pi-agent.path') || ''
  }))

  electron.ipcMain.handle('settings:set', (_event, data: Partial<SettingsData>) => {
    if (data.serverPort !== undefined) settings.serverPort = data.serverPort
    if (data.syncOnStart !== undefined) settings.syncOnStart = data.syncOnStart
    if (data.dbPath !== undefined) {
      settings.dbPath = data.dbPath
      setAppSetting('agent.opencode.path', data.dbPath)
    }
    if (data.piAgentSessionDir !== undefined) {
      settings.piAgentSessionDir = data.piAgentSessionDir
      setAppSetting('agent.pi-agent.path', data.piAgentSessionDir)
    }
    return {
      ...settings,
      dbPath: getAppSetting('agent.opencode.path') || getLocalDbPath(),
      piAgentSessionDir: getAppSetting('agent.pi-agent.path') || ''
    }
  })
}
