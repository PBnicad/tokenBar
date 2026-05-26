import electron, { nativeImage } from 'electron'
import path from 'path'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipc'
import { initDatabase, closeDatabase } from './db'
import { syncAllHistory, startPeriodicAggregation, type SyncProgressEvent } from './sync'
import { opencodeAdapter } from './adapters/opencode'
import { piAgentAdapter } from './adapters/pi-agent'
import { registerAdapter, getAvailableAdapters, disposeAll } from './adapters/registry'

let mainWindow: electron.BrowserWindow | null = null
let tray: electron.Tray | null = null
let syncTimer: ReturnType<typeof setInterval> | null = null
let lastSyncTime = 0
let forceQuit = false

function notifyStatus(status: string, error?: string): void {
  for (const win of electron.BrowserWindow.getAllWindows()) {
    win.webContents.send('connection:status', { status, port: 0, error })
  }
}

function notifySyncProgress(progress: SyncProgressEvent): void {
  for (const win of electron.BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:progress', progress)
  }
}

function notifySyncComplete(): void {
  for (const win of electron.BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:complete')
  }
}

/** Get the most recent modification time across all adapters. */
function getMaxModTime(): number {
  const adapters = getAvailableAdapters()
  if (adapters.length === 0) return 0
  return Math.max(...adapters.map((a) => a.getLastModifiedTime()))
}

/** Check if any adapter has new data. */
function hasAvailableData(): boolean {
  return getAvailableAdapters().length > 0
}

async function doSync(): Promise<void> {
  if (!hasAvailableData()) {
    notifyStatus('disconnected', 'No agent data sources found')
    return
  }

  console.log('[sync] Starting sync from all adapters...')
  notifyStatus('connecting')

  try {
    await syncAllHistory(notifySyncProgress)
    notifySyncComplete()
    notifyStatus('connected')
    lastSyncTime = Date.now()
    console.log('[sync] Sync complete')
  } catch (err) {
    console.error('[sync] Sync failed:', err)
    notifyStatus('disconnected', (err as Error).message)
  }
}

function getIconPath(): string {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico')
  }
  return path.join(__dirname, '../../build/icon.ico')
}

function createTray(): void {
  if (tray) return
  let icon: electron.NativeImage
  try {
    icon = nativeImage.createFromPath(getIconPath())
    if (icon.isEmpty()) throw new Error('empty')
    icon = icon.resize({ width: 16, height: 16 })
  } catch {
    icon = nativeImage.createEmpty()
  }
  tray = new electron.Tray(icon)
  tray.setToolTip('tokenBar')

  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        forceQuit = true
        electron.app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createWindow(): void {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'tokenBar',
    backgroundColor: '#0f0f14',
    frame: false,
    show: false,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL'] || (process.argv.includes('--dev') ? 'http://127.0.0.1:5173' : null)
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch((err: Error) => {
      mainWindow?.loadURL('http://localhost:5173').catch(() => {
        mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html'))
      })
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

electron.app.whenReady().then(async () => {
  // Register all agent adapters
  registerAdapter(opencodeAdapter)
  registerAdapter(piAgentAdapter)
  console.log(`[adapters] Registered: ${getAvailableAdapters().map((a) => a.name).join(', ')}`)

  await initDatabase()
  registerIpcHandlers()

  createWindow()
  createTray()

  // ---- Window control IPC ----
  electron.ipcMain.on('window:minimize', () => mainWindow?.minimize())
  electron.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  electron.ipcMain.on('window:close', () => mainWindow?.close())
  electron.ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  // Update IPC
  electron.ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })

  // Initial sync
  await doSync()

  // ---- Auto-update ----
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    for (const win of electron.BrowserWindow.getAllWindows()) {
      win.webContents.send('update:available', info)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    for (const win of electron.BrowserWindow.getAllWindows()) {
      win.webContents.send('update:downloaded', info)
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('[update] Error:', err.message)
  })

  // Check for updates (every 4 hours)
  autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }, 4 * 60 * 60 * 1000)

  // Start periodic aggregation
  startPeriodicAggregation()

  // Poll for changes across all adapters every 15 seconds
  syncTimer = setInterval(() => {
    const modTime = getMaxModTime()
    if (modTime > lastSyncTime) {
      console.log('[sync] Detected data change, resyncing...')
      doSync()
    }
  }, 15000)

  electron.app.on('activate', () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

electron.app.on('window-all-closed', () => {
  // Don't quit — window is hidden to tray
})

electron.app.on('before-quit', () => {
  forceQuit = true
  if (syncTimer) clearInterval(syncTimer)
  if (tray) {
    tray.destroy()
    tray = null
  }
  disposeAll()
  closeDatabase()
})
