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
import { isDbAvailable, getDbPathUsed, setDbPath, autoDetectDbPath } from './local-reader'
import type { ConnectionStatus, SettingsData, SyncProgressEvent } from '../shared/types'

const settings: SettingsData = {
  serverPort: 0,
  syncOnStart: true,
  dbPath: ''
}

export function registerIpcHandlers(): void {
  // ---- Connection ----

  electron.ipcMain.handle('connection:status', (): ConnectionStatus => {
    const available = isDbAvailable()
    return {
      status: available ? 'connected' : 'disconnected',
      port: 0,
      error: available ? undefined : `opencode.db not found at ${getDbPathUsed()}`
    }
  })

  electron.ipcMain.handle('connection:connect', async () => {
    const available = isDbAvailable()
    if (available && settings.syncOnStart) {
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
    return {
      status: available ? 'connected' : 'disconnected',
      port: 0,
      error: available ? undefined : `opencode.db not found at ${getDbPathUsed()}`
    } as ConnectionStatus
  })

  electron.ipcMain.handle('connection:disconnect', async () => {
    return { status: 'disconnected', port: 0 } as ConnectionStatus
  })

  // ---- Database path ----

  electron.ipcMain.handle('db:path', () => getDbPathUsed())

  electron.ipcMain.handle('db:available', () => isDbAvailable())

  electron.ipcMain.handle('db:setPath', (_event, filePath: string) => {
    setDbPath(filePath)
    const available = isDbAvailable()
    const status: ConnectionStatus = {
      status: available ? 'connected' : 'disconnected',
      port: 0,
      error: available ? undefined : `opencode.db not found at ${filePath}`
    }
    // Notify all windows
    for (const win of electron.BrowserWindow.getAllWindows()) {
      win.webContents.send('connection:status', status)
    }
    // Trigger sync if available
    if (available && settings.syncOnStart) {
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
    return status
  })

  electron.ipcMain.handle('db:autoDetect', () => {
    const detected = autoDetectDbPath()
    return detected
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

  // ---- Usage queries ----

  electron.ipcMain.handle('usage:overview', () => getOverview())

  electron.ipcMain.handle('usage:daily', (_event, { from, to }: { from: string; to: string }) =>
    getDailyUsage(from, to)
  )

  electron.ipcMain.handle('usage:by-model', (_event, { from, to }: { from: string; to: string }) =>
    getByModel(from, to)
  )

  electron.ipcMain.handle(
    'usage:heatmap',
    (_event, { from, to, modelId }: { from: string; to: string; modelId?: string }) =>
      getHeatmap(from, to, modelId)
  )

  electron.ipcMain.handle(
    'usage:daily-totals',
    (_event, { from, to }: { from: string; to: string }) =>
      getDailyTotals(from, to)
  )

  electron.ipcMain.handle(
    'usage:model-daily-totals',
    (_event, { from, to, modelId }: { from: string; to: string; modelId: string }) =>
      getModelDailyTotals(from, to, modelId)
  )

  // ---- Sessions ----

  electron.ipcMain.handle(
    'sessions:list',
    (_event, params: { page: number; limit: number; search?: string; modelId?: string }) =>
      getSessionList(params)
  )

  electron.ipcMain.handle('sessions:detail', (_event, sessionId: string) =>
    getSessionDetail(sessionId)
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

  electron.ipcMain.handle('settings:get', () => ({ ...settings, dbPath: getDbPathUsed() }))

  electron.ipcMain.handle('settings:set', (_event, data: Partial<SettingsData>) => {
    if (data.serverPort !== undefined) {
      settings.serverPort = data.serverPort
    }
    if (data.syncOnStart !== undefined) {
      settings.syncOnStart = data.syncOnStart
    }
    if (data.dbPath !== undefined) {
      settings.dbPath = data.dbPath
      setDbPath(data.dbPath)
    }
    return { ...settings, dbPath: getDbPathUsed() }
  })
}
