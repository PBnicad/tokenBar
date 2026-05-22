import electron from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { initDatabase } from './db'
import { isDbAvailable, getDbModTime, closeDb } from './local-reader'
import { syncAllHistory, type SyncProgressEvent } from './sync'

let mainWindow: electron.BrowserWindow | null = null
let syncTimer: ReturnType<typeof setInterval> | null = null
let lastDbModTime = 0

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

async function doSync(): Promise<void> {
  if (!isDbAvailable()) {
    notifyStatus('disconnected', 'opencode.db not found')
    return
  }

  console.log('Starting sync from local db...')
  notifyStatus('connecting')

  try {
    await syncAllHistory(notifySyncProgress)
    notifySyncComplete()
    notifyStatus('connected')
    lastDbModTime = getDbModTime()
    console.log('Sync complete')
  } catch (err) {
    console.error('Sync failed:', err)
    notifyStatus('disconnected', (err as Error).message)
  }
}

function createWindow(): void {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'opencodeBar',
    backgroundColor: '#0f0f14',
    show: false,
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
  await initDatabase()
  registerIpcHandlers()

  createWindow()

  // Initial sync
  await doSync()

  // Poll for db changes every 30 seconds
  syncTimer = setInterval(() => {
    const modTime = getDbModTime()
    if (modTime > lastDbModTime) {
      console.log('Detected db change, resyncing...')
      doSync()
    }
  }, 30000)

  electron.app.on('activate', () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

electron.app.on('window-all-closed', () => {
  if (syncTimer) clearInterval(syncTimer)
  closeDb()
  if (process.platform !== 'darwin') {
    electron.app.quit()
  }
})

electron.app.on('before-quit', () => {
  if (syncTimer) clearInterval(syncTimer)
  closeDb()
})
