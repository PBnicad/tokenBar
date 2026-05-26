import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getAppSetting } from '../db'
import type { AgentAdapter, RawSession, RawMessage } from './types'

let db: Database | null = null
let SQL: SqlJsStatic | null = null
let initialized = false
let dbPath = ''

// ---- Path detection ----

function getCommonPaths(): string[] {
  const home = os.homedir()
  return [
    path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
    ...(process.platform === 'win32'
      ? [
          path.join(home, 'AppData', 'Local', 'opencode', 'opencode.db'),
          path.join(home, 'AppData', 'Roaming', 'opencode', 'opencode.db'),
        ]
      : []),
    ...(process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db')]
      : []),
    ...(process.env.XDG_DATA_HOME
      ? [path.join(process.env.XDG_DATA_HOME, 'opencode', 'opencode.db')]
      : []),
  ]
}

function findDbPath(): string | null {
  // 1. Check user-configured path
  const configured = getAppSetting('agent.opencode.path')
  if (configured && fs.existsSync(configured)) return configured

  // 2. Auto-detect from common locations
  for (const p of getCommonPaths()) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// ---- Initialization ----

async function ensureDb(): Promise<boolean> {
  if (initialized && db) return true

  const found = findDbPath()
  if (!found) return false
  dbPath = found

  try {
    SQL = await initSqlJs()
    const buf = fs.readFileSync(dbPath)
    db = new SQL.Database(buf)
    initialized = true
    return true
  } catch {
    return false
  }
}

// ---- Adapter implementation ----

export const opencodeAdapter: AgentAdapter = {
  name: 'opencode',
  displayName: 'OpenCode',

  isAvailable() {
    return findDbPath() !== null
  },

  async fetchSessions() {
    const ok = await ensureDb()
    if (!ok || !db) return []

    try {
      const stmt = db.prepare(`
        SELECT
          s.id, s.title, s.directory,
          s.time_created as created, s.time_updated as updated,
          s.model,
          (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) as messageCount
        FROM session s
        ORDER BY s.time_created DESC
      `)

      const rows: RawSession[] = []
      while (stmt.step()) {
        const r = stmt.getAsObject() as {
          id: string; title: string; directory: string
          created: number; updated: number
        }
        rows.push({
          id: r.id,
          title: r.title || 'Untitled',
          directory: r.directory || '',
          created: r.created ?? 0,
          updated: r.updated ?? r.created ?? 0,
        })
      }
      stmt.free()
      return rows
    } catch (err) {
      console.error('[opencode] fetchSessions error:', err)
      return []
    }
  },

  async fetchMessages(sessionId: string) {
    const ok = await ensureDb()
    if (!ok || !db) return []

    try {
      const stmt = db.prepare(`
        SELECT id, session_id as sessionID, time_created as created, data
        FROM message
        WHERE session_id = ?
        ORDER BY time_created ASC
      `)
      stmt.bind([sessionId])

      const rows: RawMessage[] = []
      while (stmt.step()) {
        const r = stmt.getAsObject() as {
          id: string; sessionID: string; created: number; data: string
        }
        try {
          const data = JSON.parse(r.data)
          if (data.role !== 'assistant') continue

          const time = data.time || {}
          const tokens = data.tokens || data.usage || {}
          const cache = tokens.cache || (data.tokens && data.tokens.cache) || {}

          const pickNum = (...keys: string[]): number => {
            for (const k of keys) {
              const v = tokens[k]
              if (typeof v === 'number') return v
            }
            return 0
          }

          rows.push({
            id: r.id,
            sessionId: r.sessionID,
            providerId: data.providerID || '',
            modelId: data.modelID || '',
            cost: typeof data.cost === 'number' ? data.cost : 0,
            tokensInput: pickNum('input', 'input_tokens', 'prompt_tokens'),
            tokensOutput: pickNum('output', 'output_tokens', 'completion_tokens'),
            tokensReasoning: pickNum('reasoning', 'reasoning_tokens'),
            tokensCacheRead: typeof cache.read === 'number' ? cache.read : pickNum('cache_read', 'cache_read_input_tokens'),
            tokensCacheWrite: typeof cache.write === 'number' ? cache.write : pickNum('cache_write', 'cache_creation_input_tokens'),
            finish: data.finish || '',
            created: time.created || r.created || 0,
            completed: time.completed || time.created || r.created || 0,
          })
        } catch { /* skip parse errors */ }
      }
      stmt.free()
      return rows
    } catch (err) {
      console.error('[opencode] fetchMessages error:', err)
      return []
    }
  },

  getLastModifiedTime() {
    try {
      const p = findDbPath()
      if (!p) return 0
      return fs.statSync(p).mtimeMs
    } catch {
      return 0
    }
  },

  dispose() {
    if (db) {
      db.close()
      db = null
      SQL = null
      initialized = false
      dbPath = ''
    }
  },
}
