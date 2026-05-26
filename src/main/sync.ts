import { upsertSession, upsertMessage, recalculateAggregations, getMessageExists } from './db'
import { getAvailableAdapters } from './adapters/registry'
import type { AgentAdapter, RawSession, RawMessage } from './adapters/types'
import electron from 'electron'

export interface SyncProgressEvent {
  current: number
  total: number
  sessionTitle: string
  source: string
}

type OnProgress = (evt: SyncProgressEvent) => void

/** Sync from a single adapter's data source into the local db. */
async function syncAdapter(
  adapter: AgentAdapter,
  onProgress: OnProgress
): Promise<number> {
  console.log(`[sync] Starting sync for ${adapter.name}...`)
  const sessions = await adapter.fetchSessions()
  const total = sessions.length
  let newMessages = 0

  for (let i = 0; i < total; i++) {
    const s = sessions[i]
    const title = s.title || 'Untitled'

    onProgress({
      current: i + 1,
      total,
      sessionTitle: title,
      source: adapter.name,
    })

    try {
      upsertSession({
        id: s.id,
        source: adapter.name,
        projectID: '',
        directory: s.directory ?? '',
        title,
        created: s.created ?? 0,
        updated: s.updated ?? 0,
      })

      const messages = await adapter.fetchMessages(s.id)
      for (const msg of messages) {
        // Build a unique message id scoped to the adapter
        const msgId = `${adapter.name}:${msg.id}`
        if (getMessageExists(msgId, adapter.name)) continue

        upsertMessage({
          id: msgId,
          source: adapter.name,
          sessionID: s.id,
          providerID: msg.providerId || '',
          modelID: msg.modelId || '',
          cost: msg.cost ?? 0,
          inputTokens: msg.tokensInput ?? 0,
          outputTokens: msg.tokensOutput ?? 0,
          reasoningTokens: msg.tokensReasoning ?? 0,
          cacheReadTokens: msg.tokensCacheRead ?? 0,
          cacheWriteTokens: msg.tokensCacheWrite ?? 0,
          finish: msg.finish || '',
          created: msg.created ?? 0,
          completed: msg.completed ?? 0,
        })
        newMessages++
      }
    } catch (err) {
      console.error(`[sync] Failed to sync session ${s.id} (${adapter.name}):`, err)
    }
  }

  console.log(`[sync] ${adapter.name}: ${newMessages} new messages across ${total} sessions`)
  return newMessages
}

/** Sync ALL registered adapters. Returns total new messages synced. */
export async function syncAllHistory(onProgress: OnProgress): Promise<number> {
  const adapters = getAvailableAdapters()
  if (adapters.length === 0) {
    console.log('[sync] No adapters available')
    return 0
  }

  let totalNew = 0
  for (const adapter of adapters) {
    totalNew += await syncAdapter(adapter, onProgress)
  }

  recalculateAggregations()

  // Notify renderers
  for (const win of electron.BrowserWindow.getAllWindows()) {
    win.webContents.send('data:updated')
  }

  return totalNew
}

// ---- Periodic aggregation ----

let aggInterval: ReturnType<typeof setInterval> | null = null

export function startPeriodicAggregation(): void {
  stopPeriodicAggregation()
  aggInterval = setInterval(() => {
    recalculateAggregations()
    for (const win of electron.BrowserWindow.getAllWindows()) {
      win.webContents.send('data:updated')
    }
  }, 30000)
}

export function stopPeriodicAggregation(): void {
  if (aggInterval) {
    clearInterval(aggInterval)
    aggInterval = null
  }
}
