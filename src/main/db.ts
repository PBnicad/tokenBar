import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import electron from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database | null = null
let SQL: SqlJsStatic | null = null

export function getDbPath(): string {
  return path.join(electron.app.getPath('userData'), 'opencodebar.db')
}

export async function initDatabase(): Promise<void> {
  SQL = await initSqlJs()
  const dbPath = getDbPath()

  if (fs.existsSync(dbPath)) {
    try {
      const buf = fs.readFileSync(dbPath)
      db = new SQL.Database(buf)
    } catch {
      db = new SQL.Database()
    }
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      directory TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      synced_at INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      provider_id TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      cost REAL NOT NULL DEFAULT 0,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_reasoning INTEGER NOT NULL DEFAULT 0,
      tokens_cache_read INTEGER NOT NULL DEFAULT 0,
      tokens_cache_write INTEGER NOT NULL DEFAULT 0,
      finish_reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_reasoning INTEGER NOT NULL DEFAULT 0,
      tokens_cache_read INTEGER NOT NULL DEFAULT 0,
      tokens_cache_write INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, message_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS hourly_usage (
      hour TEXT NOT NULL,
      model_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_total INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (hour, model_id, provider_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      date TEXT NOT NULL,
      model_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_total INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      session_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, model_id, provider_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(provider_id, model_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)')
  db.run('CREATE INDEX IF NOT EXISTS idx_steps_message ON steps(message_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_steps_session ON steps(session_id)')

  saveToDisk()
}

function saveToDisk(): void {
  if (!db) return
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(getDbPath(), buffer)
  } catch (err) {
    console.error('Failed to save database:', err)
  }
}

function dbRun(sql: string, params: unknown[] = []): void {
  if (!db) return
  try {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    stmt.step()
    stmt.free()
  } catch (err) {
    console.error('SQL run error:', err, sql)
  }
}

function dbQuery<T>(sql: string, params: unknown[] = []): T[] {
  if (!db) return []
  try {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const results: T[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T)
    }
    stmt.free()
    return results
  } catch (err) {
    console.error('SQL query error:', err, sql)
    return []
  }
}

function dbGet<T>(sql: string, params: unknown[] = []): T | undefined {
  const rows = dbQuery<T>(sql, params)
  return rows[0]
}

// ---- Session operations ----

export function upsertSession(session: {
  id: string
  projectID: string
  directory: string
  title: string
  created: number
  updated: number
}): void {
  dbRun(
    `INSERT OR REPLACE INTO sessions (id, project_id, directory, title, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [session.id, session.projectID, session.directory, session.title, session.created, session.updated, Date.now()]
  )
  saveToDisk()
}

// ---- Message operations ----

export function upsertMessage(msg: {
  id: string
  sessionID: string
  providerID: string
  modelID: string
  cost: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  finish: string
  created: number
  completed: number
}): void {
  dbRun(
    `INSERT OR REPLACE INTO messages (id, session_id, provider_id, model_id, cost,
     tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
     finish_reason, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      msg.id, msg.sessionID, msg.providerID, msg.modelID, msg.cost,
      msg.inputTokens, msg.outputTokens, msg.reasoningTokens,
      msg.cacheReadTokens, msg.cacheWriteTokens, msg.finish,
      msg.created, msg.completed
    ]
  )
  saveToDisk()
}

export function getSessionMessages(sessionId: string): MessageRow[] {
  return dbQuery<MessageRow>('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at', [sessionId])
}

// ---- Step operations ----

export function insertStep(step: {
  id: string
  messageID: string
  sessionID: string
  cost: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reason: string
  timestamp: number
}): void {
  dbRun(
    `INSERT OR REPLACE INTO steps (id, message_id, session_id, cost,
     tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
     reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      step.id, step.messageID, step.sessionID, step.cost,
      step.inputTokens, step.outputTokens, step.reasoningTokens,
      step.cacheReadTokens, step.cacheWriteTokens, step.reason,
      step.timestamp
    ]
  )
}

// ---- Aggregation ----

export function recalculateAggregations(): void {
  if (!db) return
  db.run('DELETE FROM hourly_usage')
  db.run(`
    INSERT INTO hourly_usage (hour, model_id, provider_id, cost, tokens_input, tokens_output, tokens_total, message_count)
    SELECT
      strftime('%Y-%m-%dT%H', datetime(created_at / 1000, 'unixepoch')) AS hour,
      model_id,
      provider_id,
      SUM(cost),
      SUM(tokens_input),
      SUM(tokens_output),
      SUM(tokens_input + tokens_output + tokens_reasoning),
      COUNT(*)
    FROM messages
    WHERE created_at > 0
    GROUP BY hour, model_id, provider_id
  `)

  db.run('DELETE FROM daily_usage')
  db.run(`
    INSERT INTO daily_usage (date, model_id, provider_id, cost, tokens_input, tokens_output, tokens_total, message_count, session_count)
    SELECT
      strftime('%Y-%m-%d', datetime(created_at / 1000, 'unixepoch')) AS date,
      model_id,
      provider_id,
      SUM(cost),
      SUM(tokens_input),
      SUM(tokens_output),
      SUM(tokens_input + tokens_output + tokens_reasoning),
      COUNT(*),
      COUNT(DISTINCT session_id)
    FROM messages
    WHERE created_at > 0
    GROUP BY date, model_id, provider_id
  `)
  saveToDisk()
}

// ---- Query helpers ----

export function getOverview(): Overview {
  const cost = dbGet<{ total: number }>(
    'SELECT COALESCE(SUM(cost), 0) AS total FROM messages'
  )
  const tokens = dbGet<{ total: number }>(
    'SELECT COALESCE(SUM(tokens_input + tokens_output + tokens_reasoning), 0) AS total FROM messages'
  )
  const sessions = dbGet<{ total: number }>(
    'SELECT COUNT(*) AS total FROM sessions'
  )
  const messages = dbGet<{ total: number }>(
    'SELECT COUNT(*) AS total FROM messages'
  )
  const models = dbGet<{ total: number }>(
    'SELECT COUNT(DISTINCT model_id) AS total FROM messages'
  )
  return {
    totalCost: Math.round((cost?.total ?? 0) * 10000) / 10000,
    totalTokens: tokens?.total ?? 0,
    totalSessions: sessions?.total ?? 0,
    totalMessages: messages?.total ?? 0,
    uniqueModels: models?.total ?? 0
  }
}

export function getDailyUsage(from: string, to: string): DailyUsageRow[] {
  return dbQuery<DailyUsageRow>(
    'SELECT * FROM daily_usage WHERE date >= ? AND date <= ? ORDER BY date, model_id',
    [from, to]
  )
}

export function getByModel(from: string, to: string): ModelAggregation[] {
  return dbQuery<ModelAggregation>(
    `SELECT provider_id, model_id,
      SUM(cost) AS cost,
      SUM(tokens_input) AS tokens_input,
      SUM(tokens_output) AS tokens_output,
      SUM(tokens_total) AS tokens_total,
      SUM(message_count) AS message_count
     FROM daily_usage
     WHERE date >= ? AND date <= ?
     GROUP BY provider_id, model_id
     ORDER BY cost DESC`,
    [from, to]
  )
}

export function getHeatmap(from: string, to: string, modelId?: string): HeatmapCell[] {
  let sql = `
    SELECT
      substr(hour, 1, 10) AS date,
      CAST(substr(hour, 12, 2) AS INTEGER) AS hour,
      SUM(tokens_total) AS tokens,
      SUM(cost) AS cost
    FROM hourly_usage
    WHERE hour >= (? || 'T00') AND hour <= (? || 'T23')
  `
  const params: unknown[] = [from, to]
  if (modelId) {
    sql += ' AND model_id = ?'
    params.push(modelId)
  }
  sql += ' GROUP BY date, hour ORDER BY date, hour'
  return dbQuery<HeatmapCell>(sql, params)
}

export function getSessionList(params: {
  page: number; limit: number; search?: string; modelId?: string
}): { sessions: SessionListItem[]; total: number } {
  let where = 'WHERE 1=1'
  const queryParams: unknown[] = []
  if (params.search) {
    where += ' AND s.title LIKE ?'
    queryParams.push(`%${params.search}%`)
  }
  if (params.modelId) {
    where += ' AND m.model_id = ?'
    queryParams.push(params.modelId)
  }

  const countSql = `
    SELECT COUNT(*) AS total FROM sessions s
    LEFT JOIN (SELECT session_id, model_id FROM messages GROUP BY session_id) m
    ON s.id = m.session_id
    ${where}
  `
  const count = dbGet<{ total: number }>(countSql, queryParams)
  const total = count?.total ?? 0

  const limit = params.limit
  const offset = (params.page - 1) * limit
  const selectSql = `
    SELECT
      s.id, s.title, s.directory, s.created_at,
      COALESCE(m_sum.provider_id, '') AS provider_id,
      COALESCE(m_sum.model_id, '') AS model_id,
      COALESCE(m_sum.cost, 0) AS cost,
      COALESCE(m_sum.tokens_total, 0) AS tokens_total,
      COALESCE(m_sum.message_count, 0) AS message_count
    FROM sessions s
    LEFT JOIN (
      SELECT
        session_id,
        MAX(provider_id) AS provider_id,
        MAX(model_id) AS model_id,
        SUM(cost) AS cost,
        SUM(tokens_input + tokens_output + tokens_reasoning) AS tokens_total,
        COUNT(*) AS message_count
      FROM messages
      GROUP BY session_id
    ) m_sum ON s.id = m_sum.session_id
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `
  const sessions = dbQuery<SessionListItem>(selectSql, [...queryParams, limit, offset])
  return { sessions, total }
}

export function getSessionDetail(sessionId: string): SessionDetail | null {
  const session = dbGet<SessionRow>('SELECT * FROM sessions WHERE id = ?', [sessionId])
  if (!session) return null
  const messages = getSessionMessages(sessionId)
  const totals = dbGet<{ cost: number; tokens: number }>(
    'SELECT COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(tokens_input + tokens_output + tokens_reasoning), 0) AS tokens FROM messages WHERE session_id = ?',
    [sessionId]
  )
  return {
    session,
    messages,
    totalCost: Math.round((totals?.cost ?? 0) * 10000) / 10000,
    totalTokens: totals?.tokens ?? 0
  }
}

export function getMessageExists(messageId: string): boolean {
  const row = dbGet<{ id: string }>('SELECT id FROM messages WHERE id = ?', [messageId])
  return !!row
}

export interface DailyTotal {
  date: string
  tokens: number
  cost: number
  input: number
  output: number
  reasoning: number
  cache_read: number
  cache_write: number
  messages: number
}

export function getDailyTotals(from: string, to: string): DailyTotal[] {
  return dbQuery<DailyTotal>(
    `SELECT date,
      SUM(tokens_total) AS tokens,
      SUM(cost) AS cost,
      SUM(tokens_input) AS input,
      SUM(tokens_output) AS output,
      SUM(tokens_reasoning) AS reasoning,
      SUM(tokens_cache_read) AS cache_read,
      SUM(tokens_cache_write) AS cache_write,
      SUM(message_count) AS messages
     FROM daily_usage
     WHERE date >= ? AND date <= ?
     GROUP BY date
     ORDER BY date`,
    [from, to]
  )
}

export function getModelDailyTotals(from: string, to: string, modelId: string): DailyTotal[] {
  return dbQuery<DailyTotal>(
    `SELECT date,
      SUM(tokens_total) AS tokens,
      SUM(cost) AS cost,
      SUM(tokens_input) AS input,
      SUM(tokens_output) AS output,
      SUM(tokens_reasoning) AS reasoning,
      SUM(tokens_cache_read) AS cache_read,
      SUM(tokens_cache_write) AS cache_write,
      SUM(message_count) AS messages
     FROM daily_usage
     WHERE date >= ? AND date <= ? AND model_id = ?
     GROUP BY date
     ORDER BY date`,
    [from, to, modelId]
  )
}

export function closeDatabase(): void {
  if (db) {
    saveToDisk()
    db.close()
    db = null
    SQL = null
  }
}

// ---- App Settings ----

export function getAppSetting(key: string): string | null {
  const row = dbGet<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key])
  return row?.value ?? null
}

export function setAppSetting(key: string, value: string): void {
  dbRun('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, value])
  saveToDisk()
}
