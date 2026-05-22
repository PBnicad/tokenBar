import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { getAppSetting, setAppSetting } from './db'

let db: Database | null = null
let SQL: SqlJsStatic | null = null
let initialized = false
let currentDbPath = ''

export interface LocalSession {
  id: string
  projectID: string
  directory: string
  title: string
  created: number
  updated: number
  cost: number
  tokensInput: number
  tokensOutput: number
  tokensReasoning: number
  tokensCacheRead: number
  tokensCacheWrite: number
  model: { id: string; providerID: string; variant: string } | null
  messageCount: number
}

export interface LocalMessage {
  id: string
  sessionID: string
  role: string
  created: number
  completed: number
  providerID: string
  modelID: string
  cost: number
  tokensInput: number
  tokensOutput: number
  tokensReasoning: number
  tokensCacheRead: number
  tokensCacheWrite: number
  finish: string
}

// Common locations where opencode.db might exist
function getCommonDbPaths(): string[] {
  const home = os.homedir()
  const candidates: string[] = []

  // Primary location (current opencode default)
  candidates.push(path.join(home, '.local', 'share', 'opencode', 'opencode.db'))

  // Windows alternate locations
  if (process.platform === 'win32') {
    candidates.push(path.join(home, 'AppData', 'Local', 'opencode', 'opencode.db'))
    candidates.push(path.join(home, 'AppData', 'Roaming', 'opencode', 'opencode.db'))
  }

  // macOS alternate
  if (process.platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db'))
  }

  // Linux alternate (XDG_DATA_HOME)
  const xdgData = process.env.XDG_DATA_HOME
  if (xdgData) {
    candidates.push(path.join(xdgData, 'opencode', 'opencode.db'))
  }

  return candidates
}

export function autoDetectDbPath(): string | null {
  const candidates = getCommonDbPaths()
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  return null
}

function getConfiguredDbPath(): string {
  // 1. Check saved setting
  const saved = getAppSetting('dbPath')
  if (saved && fs.existsSync(saved)) {
    return saved
  }

  // 2. Auto-detect
  const detected = autoDetectDbPath()
  if (detected) {
    setAppSetting('dbPath', detected)
    return detected
  }

  // 3. Default path (even if not exists, so user can see where we expect it)
  return getCommonDbPaths()[0]
}

export function setDbPath(p: string): void {
  if (p && fs.existsSync(p)) {
    setAppSetting('dbPath', p)
    // Reset connection so next access uses new path
    closeDb()
  }
}

export function getDbPathUsed(): string {
  return currentDbPath || getConfiguredDbPath()
}

async function ensureInitialized(): Promise<boolean> {
  if (initialized && db) return true

  const p = getConfiguredDbPath()
  currentDbPath = p

  if (!fs.existsSync(p)) {
    console.error('opencode.db not found at', p)
    return false
  }

  try {
    SQL = await initSqlJs()
    const buf = fs.readFileSync(p)
    db = new SQL.Database(buf)
    initialized = true
    console.log('Opened opencode.db at', p)
    return true
  } catch (err) {
    console.error('Failed to open opencode.db:', (err as Error).message)
    return false
  }
}

export function isDbAvailable(): boolean {
  const p = getConfiguredDbPath()
  return fs.existsSync(p)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    SQL = null
    initialized = false
    currentDbPath = ''
  }
}

export async function fetchAllSessions(): Promise<LocalSession[]> {
  const ok = await ensureInitialized()
  if (!ok || !db) return []

  try {
    const stmt = db.prepare(`
      SELECT
        s.id,
        s.project_id as projectID,
        s.directory,
        s.title,
        s.time_created as created,
        s.time_updated as updated,
        s.cost,
        s.tokens_input as tokensInput,
        s.tokens_output as tokensOutput,
        s.tokens_reasoning as tokensReasoning,
        s.tokens_cache_read as tokensCacheRead,
        s.tokens_cache_write as tokensCacheWrite,
        s.model,
        (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) as messageCount
      FROM session s
      ORDER BY s.time_created DESC
    `)

    const rows: LocalSession[] = []
    while (stmt.step()) {
      const r = stmt.getAsObject() as {
        id: string; projectID: string; directory: string; title: string;
        created: number; updated: number; cost: number;
        tokensInput: number; tokensOutput: number; tokensReasoning: number;
        tokensCacheRead: number; tokensCacheWrite: number;
        model: string | null; messageCount: number
      }

      let modelObj: { id: string; providerID: string; variant: string } | null = null
      if (r.model) {
        try {
          const parsed = JSON.parse(r.model)
          if (parsed && typeof parsed === 'object') {
            modelObj = {
              id: String(parsed.id || parsed.modelID || ''),
              providerID: String(parsed.providerID || ''),
              variant: String(parsed.variant || 'default')
            }
          }
        } catch { /* ignore parse error */ }
      }
      rows.push({ ...r, model: modelObj })
    }
    stmt.free()
    return rows
  } catch (err) {
    console.error('fetchAllSessions error:', err)
    return []
  }
}

export async function fetchSessionMessages(sessionId: string): Promise<LocalMessage[]> {
  const ok = await ensureInitialized()
  if (!ok || !db) return []

  try {
    // sql.js doesn't support json_extract, so we need to parse the data column manually
    const stmt = db.prepare(`
      SELECT id, session_id as sessionID, time_created as created, data
      FROM message
      WHERE session_id = ?
      ORDER BY time_created ASC
    `)
    stmt.bind([sessionId])

    const rows: LocalMessage[] = []
    while (stmt.step()) {
      const r = stmt.getAsObject() as {
        id: string; sessionID: string; created: number; data: string
      }
      try {
        const data = JSON.parse(r.data)
        if (data.role !== 'assistant') continue

        const time = data.time || {}
        const tokens = data.tokens || {}
        const cache = tokens.cache || {}

        rows.push({
          id: r.id,
          sessionID: r.sessionID,
          role: data.role || 'assistant',
          created: time.created || r.created || 0,
          completed: time.completed || time.created || r.created || 0,
          providerID: data.providerID || '',
          modelID: data.modelID || '',
          cost: typeof data.cost === 'number' ? data.cost : 0,
          tokensInput: typeof tokens.input === 'number' ? tokens.input : 0,
          tokensOutput: typeof tokens.output === 'number' ? tokens.output : 0,
          tokensReasoning: typeof tokens.reasoning === 'number' ? tokens.reasoning : 0,
          tokensCacheRead: typeof cache.read === 'number' ? cache.read : 0,
          tokensCacheWrite: typeof cache.write === 'number' ? cache.write : 0,
          finish: data.finish || ''
        })
      } catch { /* skip parse errors */ }
    }
    stmt.free()
    return rows
  } catch (err) {
    console.error('fetchSessionMessages error:', err)
    return []
  }
}

export function getDbModTime(): number {
  try {
    const p = getConfiguredDbPath()
    const stat = fs.statSync(p)
    return stat.mtimeMs
  } catch {
    return 0
  }
}
