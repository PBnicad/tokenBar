import { contextBridge, ipcRenderer } from 'electron'

const api = {
  overview: (source?: string, from?: string, to?: string) => ipcRenderer.invoke('usage:overview', { source, from, to }),
  dailyUsage: (from: string, to: string, source?: string) => ipcRenderer.invoke('usage:daily', { from, to, source }),
  byModel: (from: string, to: string, source?: string) => ipcRenderer.invoke('usage:by-model', { from, to, source }),
  heatmap: (from: string, to: string, modelId?: string, source?: string) =>
    ipcRenderer.invoke('usage:heatmap', { from, to, modelId, source }),
  dailyTotals: (from: string, to: string, source?: string) =>
    ipcRenderer.invoke('usage:daily-totals', { from, to, source }),
  modelDailyTotals: (from: string, to: string, modelId: string, source?: string) =>
    ipcRenderer.invoke('usage:model-daily-totals', { from, to, modelId, source }),
  sessionList: (params: {
    page: number
    limit: number
    search?: string
    modelId?: string
    source?: string
  }) => ipcRenderer.invoke('sessions:list', params),
  sessionDetail: (sessionId: string, source?: string) => ipcRenderer.invoke('sessions:detail', { sessionId, source }),
  connectionStatus: () => ipcRenderer.invoke('connection:status'),
  connect: () => ipcRenderer.invoke('connection:connect'),
  disconnect: () => ipcRenderer.invoke('connection:disconnect'),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (data: { serverPort?: number; syncOnStart?: boolean; dbPath?: string }) =>
      ipcRenderer.invoke('settings:set', data)
  },
  dbPath: {
    get: () => ipcRenderer.invoke('db:path'),
    available: () => ipcRenderer.invoke('db:available'),
    set: (filePath: string) => ipcRenderer.invoke('db:setPath', filePath),
    autoDetect: () => ipcRenderer.invoke('db:autoDetect'),
  },
  dialog: {
    openFile: (opts?: {
      title?: string
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
    }) => ipcRenderer.invoke('dialog:openFile', opts ?? {}),
    openFolder: (opts?: { title?: string; defaultPath?: string }) =>
      ipcRenderer.invoke('dialog:openFolder', opts ?? {}),
  },
  agentConfig: {
    getPath: (agentName: string) => ipcRenderer.invoke('agent:getPath', agentName),
    setPath: (agentName: string, p: string) => ipcRenderer.invoke('agent:setPath', { agentName, path: p }),
    detectPath: (agentName: string) => ipcRenderer.invoke('agent:detectPath', agentName),
    isAvailable: (agentName: string) => ipcRenderer.invoke('agent:isAvailable', agentName),
  },
  onConnectionStatus: (callback: (status: unknown) => void) => {
    const handler = (_event: unknown, status: unknown) => callback(status)
    ipcRenderer.on('connection:status', handler)
    return () => ipcRenderer.removeListener('connection:status', handler)
  },
  onSyncProgress: (callback: (progress: unknown) => void) => {
    const handler = (_event: unknown, progress: unknown) => callback(progress)
    ipcRenderer.on('sync:progress', handler)
    return () => ipcRenderer.removeListener('sync:progress', handler)
  },
  onSyncComplete: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('sync:complete', handler)
    return () => ipcRenderer.removeListener('sync:complete', handler)
  },
  onDataUpdated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('data:updated', handler)
    return () => ipcRenderer.removeListener('data:updated', handler)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (callback: (maximized: boolean) => void) => {
      const handler = (_event: unknown, maximized: boolean) => callback(maximized)
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.removeListener('window:maximized', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
