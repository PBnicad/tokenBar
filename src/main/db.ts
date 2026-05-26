import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import electron from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database | null = null
let SQL: SqlJsStatic | null = null

export function getDbPath(): string {
  return path.join(electron.app.getPath('userData'), 'tokenbar.db')
}

/** Detect if an old table has the pre-source PK and drop-then-recreate it. */
function migrateTable(name: string, createSql: string): void {
  if (!db) return
  // Check if the table already has 'source' in its columns
  const cols = dbQuery<{ name: string }>(`PRAGMA table_info(${name})`)
  const hasSource = cols.some((c) => c.name === 'source')

  if (hasSource) {
    // Check if source is part of the PK (new schema) by checking table DDL
    const ddl = dbQuery<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [name]
    )
    const sql = ddl[0]?.sql || ''
    // Old schema: PK doesn't include source. New schema: PK includes source.
    // If the DDL has 'source' in the PRIMARY KEY clause, it's the new schema.
    if (sql.includes('source') && sql.toUpperCase().includes('PRIMARY KEY')) {
      const pkPart = sql.substring(sql.toUpperCase().indexOf('PRIMARY KEY'))
      if (pkPart.includes('source')) return // Already migrated
    }
  }

  // Drop old table and recreate with correct schema
  console.log(`[db] Migrating table ${name} to new schema...`)
  db.run(`DROP TABLE IF EXISTS ${name}`)
  db.run(createSql)
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

  // ---- Migration: drop old tables that lacked the 'source' column in their PK ----
  // The old schema had PKs without source, causing UNIQUE constraint violations
  // when the same id/hour/date appears from multiple agents.
  migrateTable('sessions', `
    CREATE TABLE sessions (
      id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT '',
      directory TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      synced_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, source)
    )
  `)

  migrateTable('messages', `
    CREATE TABLE messages (
      id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
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
      completed_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, source)
    )
  `)

  // Steps table is unchanged (no source column needed)
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

  migrateTable('hourly_usage', `
    CREATE TABLE hourly_usage (
      hour TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_total INTEGER NOT NULL DEFAULT 0,
      tokens_reasoning INTEGER NOT NULL DEFAULT 0,
      tokens_cache_read INTEGER NOT NULL DEFAULT 0,
      tokens_cache_write INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (hour, source, model_id, provider_id)
    )
  `)

  migrateTable('daily_usage', `
    CREATE TABLE daily_usage (
      date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_total INTEGER NOT NULL DEFAULT 0,
      tokens_reasoning INTEGER NOT NULL DEFAULT 0,
      tokens_cache_read INTEGER NOT NULL DEFAULT 0,
      tokens_cache_write INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      session_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, source, model_id, provider_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, source)')
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
  source: string
  projectID: string
  directory: string
  title: string
  created: number
  updated: number
}): void {
  dbRun(
    `INSERT OR REPLACE INTO sessions (id, source, project_id, directory, title, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [session.id, session.source, session.projectID, session.directory, session.title, session.created, session.updated, Date.now()]
  )
  saveToDisk()
}

// ---- Message operations ----

export function upsertMessage(msg: {
  id: string
  source: string
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
    `INSERT OR REPLACE INTO messages (id, source, session_id, provider_id, model_id, cost,
     tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
     finish_reason, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      msg.id, msg.source, msg.sessionID, msg.providerID, msg.modelID, msg.cost,
      msg.inputTokens, msg.outputTokens, msg.reasoningTokens,
      msg.cacheReadTokens, msg.cacheWriteTokens, msg.finish,
      msg.created, msg.completed
    ]
  )
  saveToDisk()
}

export function getSessionMessages(sessionId: string, source?: string): MessageRow[] {
  if (source) {
    return dbQuery<MessageRow>('SELECT * FROM messages WHERE session_id = ? AND source = ? ORDER BY created_at', [sessionId, source])
  }
  return dbQuery<MessageRow>('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at', [sessionId])
}

// ---- Aggregation ----

export function recalculateAggregations(): void {
  if (!db) return
  db.run('DELETE FROM hourly_usage')
  db.run(`
    INSERT INTO hourly_usage (hour, source, model_id, provider_id, cost, tokens_input, tokens_output, tokens_total, tokens_reasoning, tokens_cache_read, tokens_cache_write, message_count)
    SELECT
      strftime('%Y-%m-%dT%H', datetime(created_at / 1000, 'unixepoch')) AS hour,
      source,
      model_id,
      provider_id,
      SUM(cost),
      SUM(tokens_input),
      SUM(tokens_output),
      SUM(tokens_input + tokens_output + tokens_reasoning),
      SUM(tokens_reasoning),
      SUM(tokens_cache_read),
      SUM(tokens_cache_write),
      COUNT(*)
    FROM messages
    WHERE created_at > 0
    GROUP BY hour, source, model_id, provider_id
  `)

  db.run('DELETE FROM daily_usage')
  db.run(`
    INSERT INTO daily_usage (date, source, model_id, provider_id, cost, tokens_input, tokens_output, tokens_total, tokens_reasoning, tokens_cache_read, tokens_cache_write, message_count, session_count)
    SELECT
      strftime('%Y-%m-%d', datetime(created_at / 1000, 'unixepoch')) AS date,
      source,
      model_id,
      provider_id,
      SUM(cost),
      SUM(tokens_input),
      SUM(tokens_output),
      SUM(tokens_input + tokens_output + tokens_reasoning),
      SUM(tokens_reasoning),
      SUM(tokens_cache_read),
      SUM(tokens_cache_write),
      COUNT(*),
      COUNT(DISTINCT session_id)
    FROM messages
    WHERE created_at > 0
    GROUP BY date, source, model_id, provider_id
  `)
  saveToDisk()
}

// ---- Query helpers ----

export function getAgentSources(): { source: string; sessions: number; messages: number }[] {
  return dbQuery<{ source: string; sessions: number; messages: number }>(`
    SELECT
      COALESCE(s.source, m.source, '') AS source,
      COUNT(DISTINCT s.id) AS sessions,
      COUNT(DISTINCT m.id) AS messages
    FROM sessions s
    FULL OUTER JOIN messages m ON s.source = m.source
    WHERE COALESCE(s.source, m.source, '') != ''
    GROUP BY COALESCE(s.source, m.source)
    ORDER BY source
  `)
}

export function getOverview(source?: string, from?: string, to?: string): Overview {
  let msgWhere = ''
  const params: unknown[] = []
  const conditions: string[] = []
  if (source) { conditions.push('source = ?'); params.push(source) }
  if (from) { conditions.push('created_at >= ?'); params.push(new Date(from).getTime()) }
  if (to) { conditions.push('created_at <= ?'); params.push(new Date(to + 'T23:59:59').getTime()) }
  if (conditions.length > 0) msgWhere = ' WHERE ' + conditions.join(' AND ')

  let sessWhere = ''
  const sessParams: unknown[] = []
  if (source) { sessWhere = ' WHERE source = ?'; sessParams.push(source) }

  // When date filter is active, count sessions from messages (not sessions table)
  const sessionCountSql = (from || to)
    ? `SELECT COUNT(DISTINCT session_id) AS total FROM messages${msgWhere}`
    : `SELECT COUNT(*) AS total FROM sessions${sessWhere}`
  const sessionCountParams = (from || to) ? params : sessParams

  const cost = dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(cost), 0) AS total FROM messages${msgWhere}`, params
  )
  const tokens = dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(tokens_input + tokens_output + tokens_reasoning), 0) AS total FROM messages${msgWhere}`, params
  )
  const sessions = dbGet<{ total: number }>(sessionCountSql, sessionCountParams)
  const messages = dbGet<{ total: number }>(
    `SELECT COUNT(*) AS total FROM messages${msgWhere}`, params
  )
  const models = dbGet<{ total: number }>(
    `SELECT COUNT(DISTINCT model_id) AS total FROM messages${msgWhere}`, params
  )
  return {
    totalCost: Math.round((cost?.total ?? 0) * 10000) / 10000,
    totalTokens: tokens?.total ?? 0,
    totalSessions: sessions?.total ?? 0,
    totalMessages: messages?.total ?? 0,
    uniqueModels: models?.total ?? 0
  }
}

export function getDailyUsage(from: string, to: string, source?: string): DailyUsageRow[] {
  let sql = 'SELECT * FROM daily_usage WHERE date >= ? AND date <= ?'
  const params: unknown[] = [from, to]
  if (source) {
    sql += ' AND source = ?'
    params.push(source)
  }
  sql += ' ORDER BY date, model_id'
  return dbQuery<DailyUsageRow>(sql, params)
}

export function getByModel(from: string, to: string, source?: string): ModelAggregation[] {
  let sql = `SELECT provider_id, model_id,
      SUM(cost) AS cost,
      SUM(tokens_input) AS tokens_input,
      SUM(tokens_output) AS tokens_output,
      SUM(tokens_total) AS tokens_total,
      SUM(message_count) AS message_count
     FROM daily_usage
     WHERE date >= ? AND date <= ?`
  const params: unknown[] = [from, to]
  if (source) {
    sql += ' AND source = ?'
    params.push(source)
  }
  sql += ' GROUP BY provider_id, model_id ORDER BY cost DESC'
  return dbQuery<ModelAggregation>(sql, params)
}

export function getHeatmap(from: string, to: string, source?: string, modelId?: string): HeatmapCell[] {
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
  if (source) {
    sql += ' AND source = ?'
    params.push(source)
  }
  if (modelId) {
    sql += ' AND model_id = ?'
    params.push(modelId)
  }
  sql += ' GROUP BY date, hour ORDER BY date, hour'
  return dbQuery<HeatmapCell>(sql, params)
}

export function getSessionList(params: {
  page: number; limit: number; search?: string; modelId?: string; source?: string
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
  if (params.source) {
    where += ' AND s.source = ?'
    queryParams.push(params.source)
  }

  const countSql = `
    SELECT COUNT(*) AS total FROM sessions s
    LEFT JOIN (SELECT session_id, source, model_id FROM messages GROUP BY session_id, source) m
    ON s.id = m.session_id AND s.source = m.source
    ${where}
  `
  const count = dbGet<{ total: number }>(countSql, queryParams)
  const total = count?.total ?? 0

  const limit = params.limit
  const offset = (params.page - 1) * limit
  const selectSql = `
    SELECT
      s.id, s.title, s.source, s.directory, s.created_at,
      COALESCE(m_sum.provider_id, '') AS provider_id,
      COALESCE(m_sum.model_id, '') AS model_id,
      COALESCE(m_sum.cost, 0) AS cost,
      COALESCE(m_sum.tokens_total, 0) AS tokens_total,
      COALESCE(m_sum.message_count, 0) AS message_count
    FROM sessions s
    LEFT JOIN (
      SELECT
        session_id, source,
        MAX(provider_id) AS provider_id,
        MAX(model_id) AS model_id,
        SUM(cost) AS cost,
        SUM(tokens_input + tokens_output + tokens_reasoning) AS tokens_total,
        COUNT(*) AS message_count
      FROM messages
      GROUP BY session_id, source
    ) m_sum ON s.id = m_sum.session_id AND s.source = m_sum.source
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `
  const sessions = dbQuery<SessionListItem>(selectSql, [...queryParams, limit, offset])
  return { sessions, total }
}

export function getSessionDetail(sessionId: string, source?: string): SessionDetail | null {
  let sessionSql = 'SELECT * FROM sessions WHERE id = ?'
  const sessionParams: unknown[] = [sessionId]
  if (source) {
    sessionSql += ' AND source = ?'
    sessionParams.push(source)
  }
  const session = dbGet<SessionRow>(sessionSql, sessionParams)
  if (!session) return null

  const messages = getSessionMessages(sessionId, source)
  let totalsSql = 'SELECT COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(tokens_input + tokens_output + tokens_reasoning), 0) AS tokens FROM messages WHERE session_id = ?'
  const totalsParams: unknown[] = [sessionId]
  if (source) {
    totalsSql += ' AND source = ?'
    totalsParams.push(source)
  }
  const totals = dbGet<{ cost: number; tokens: number }>(totalsSql, totalsParams)
  return {
    session,
    messages,
    totalCost: Math.round((totals?.cost ?? 0) * 10000) / 10000,
    totalTokens: totals?.tokens ?? 0
  }
}

export function getMessageExists(messageId: string, source: string): boolean {
  const row = dbGet<{ id: string }>('SELECT id FROM messages WHERE id = ? AND source = ?', [messageId, source])
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

export function getDailyTotals(from: string, to: string, source?: string): DailyTotal[] {
  let sql = `SELECT date,
      SUM(tokens_total) AS tokens,
      SUM(cost) AS cost,
      SUM(tokens_input) AS input,
      SUM(tokens_output) AS output,
      SUM(tokens_reasoning) AS reasoning,
      SUM(tokens_cache_read) AS cache_read,
      SUM(tokens_cache_write) AS cache_write,
      SUM(message_count) AS messages
     FROM daily_usage
     WHERE date >= ? AND date <= ?`
  const params: unknown[] = [from, to]
  if (source) {
    sql += ' AND source = ?'
    params.push(source)
  }
  sql += ' GROUP BY date ORDER BY date'
  return dbQuery<DailyTotal>(sql, params)
}

export function getModelDailyTotals(from: string, to: string, modelId: string, source?: string): DailyTotal[] {
  let sql = `SELECT date,
      SUM(tokens_total) AS tokens,
      SUM(cost) AS cost,
      SUM(tokens_input) AS input,
      SUM(tokens_output) AS output,
      SUM(tokens_reasoning) AS reasoning,
      SUM(tokens_cache_read) AS cache_read,
      SUM(tokens_cache_write) AS cache_write,
      SUM(message_count) AS messages
     FROM daily_usage
     WHERE date >= ? AND date <= ? AND model_id = ?`
  const params: unknown[] = [from, to, modelId]
  if (source) {
    sql += ' AND source = ?'
    params.push(source)
  }
  sql += ' GROUP BY date ORDER BY date'
  return dbQuery<DailyTotal>(sql, params)
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
