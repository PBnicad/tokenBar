import { upsertSession, upsertMessage, insertStep, recalculateAggregations, getMessageExists } from './db'
import { fetchAllSessions, fetchSessionMessages } from './local-reader'
import electron from 'electron'

let aggInterval: ReturnType<typeof setInterval> | null = null

export interface SyncProgressEvent {
  current: number
  total: number
  sessionTitle: string
}

type OnProgress = (evt: SyncProgressEvent) => void

export async function syncAllHistory(onProgress: OnProgress): Promise<void> {
  const sessions = await fetchAllSessions()
  const total = sessions.length

  for (let i = 0; i < total; i++) {
    const session = sessions[i]
    const title = session.title || 'Untitled'

    onProgress({ current: i + 1, total, sessionTitle: title })

    try {
      upsertSession({
        id: session.id,
        projectID: session.projectID ?? '',
        directory: session.directory ?? '',
        title: session.title || 'Untitled',
        created: session.created ?? 0,
        updated: session.updated ?? 0
      })

      const messages = await fetchSessionMessages(session.id)
      for (const msg of messages) {
        if (getMessageExists(msg.id)) continue

        upsertMessage({
          id: msg.id,
          sessionID: msg.sessionID,
          providerID: msg.providerID ?? '',
          modelID: msg.modelID ?? '',
          cost: msg.cost ?? 0,
          inputTokens: msg.tokensInput ?? 0,
          outputTokens: msg.tokensOutput ?? 0,
          reasoningTokens: msg.tokensReasoning ?? 0,
          cacheReadTokens: msg.tokensCacheRead ?? 0,
          cacheWriteTokens: msg.tokensCacheWrite ?? 0,
          finish: msg.finish ?? '',
          created: msg.created ?? 0,
          completed: msg.completed ?? 0
        })
      }
    } catch (err) {
      console.error(`Failed to sync session ${session.id}:`, err)
    }
  }

  recalculateAggregations()
}

export async function startPeriodicAggregation(): Promise<void> {
  stopPeriodicAggregation()
  aggInterval = setInterval(() => {
    recalculateAggregations()
    notifyRenderers()
  }, 30000)
}

export function stopPeriodicAggregation(): void {
  if (aggInterval) {
    clearInterval(aggInterval)
    aggInterval = null
  }
}

function notifyRenderers(): void {
  for (const win of electron.BrowserWindow.getAllWindows()) {
    // Could notify renderer to refresh data if needed
  }
}
