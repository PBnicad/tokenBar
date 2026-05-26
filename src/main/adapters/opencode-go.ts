// OpenCode Go cloud usage adapter — fetches quota via HTML scraping
// Data source: https://opencode.ai/workspace/{id}/go

import { getAppSetting, setAppSetting } from '../db'

export interface OpenCodeGoWindow {
  quotaPercent: number   // 0-100
  resetInSec: number     // seconds until reset
}

export interface OpenCodeGoSnapshot {
  rolling: OpenCodeGoWindow | null
  weekly: OpenCodeGoWindow | null
  monthly: OpenCodeGoWindow | null
  usageHistory: OpenCodeGoUsageRecord[]
  fetchedAt: number
}

export interface OpenCodeGoUsageRecord {
  id: string
  timeCreated: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cost: number
  keyID: string
}

async function fetchWithAuth(url: string): Promise<string> {
  const cookie = getAppSetting('opencodego.authCookie') || ''
  const resp = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      Cookie: `auth=${cookie}`,
      'User-Agent': 'tokenBar/0.2',
    },
  })
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) throw new Error('Auth failed. Refresh your cookie.')
    throw new Error(`HTTP ${resp.status}`)
  }
  return resp.text()
}

function extractWindow(html: string, fieldName: string): OpenCodeGoWindow | null {
  const patterns = [
    new RegExp(`${escapeRegExp(fieldName)}\\s*:\\s*\\$R\\[\\d+\\]\\s*=\\s*\\{`),
    new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\{`),
    new RegExp(`${escapeRegExp(fieldName)}\\s*:\\s*\\{`),
    new RegExp(`${escapeRegExp(fieldName)}\\s*=\\s*\\{`),
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (!match || match.index === undefined) continue
    const start = match.index + match[0].lastIndexOf('{')
    const obj = readObjectLiteral(html, start)
    if (!obj) continue
    const parsed = parseLooseObjectLiteral(obj) as Record<string, unknown>
    const quotaPercent = asNumber(parsed.usagePercent)
    const resetInSec = asNumber(parsed.resetInSec)
    if (quotaPercent === null || resetInSec === null) continue
    return {
      quotaPercent: Math.round(quotaPercent),
      resetInSec: Math.max(0, Math.round(resetInSec)),
    }
  }
  return null
}

function readObjectLiteral(html: string, start: number): string | null {
  let depth = 0
  let inSQ = false, inDQ = false, inBT = false, escaped = false
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (escaped) { escaped = false; continue }
    if ((inSQ || inDQ || inBT) && c === '\\') { escaped = true; continue }
    if (!inDQ && !inBT && c === "'") { inSQ = !inSQ; continue }
    if (!inSQ && !inBT && c === '"') { inDQ = !inDQ; continue }
    if (!inSQ && !inDQ && c === '`') { inBT = !inBT; continue }
    if (inSQ || inDQ || inBT) continue
    if (c === '{') depth++
    if (c === '}') {
      depth--
      if (depth === 0) return html.slice(start, i + 1)
    }
  }
  return null
}

function parseLooseObjectLiteral(input: string): unknown {
  const normalized = input
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'((?:\\.|[^'\\])*)'/g, (_, v: string) => `"${v.replace(/"/g, '\\"')}"`)
    .replace(/("(?:\\.|[^"\\])*")|\bundefined\b/g, (_, q) => q ?? 'null')
    .replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(normalized)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') { const p = Number(value); if (Number.isFinite(p)) return p }
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function fetchOpenCodeGoQuota(workspaceId?: string): Promise<OpenCodeGoSnapshot> {
  const id = workspaceId || getAppSetting('opencodego.workspaceId') || ''
  if (!id) throw new Error('Workspace ID not configured')

  const html = await fetchWithAuth(`https://opencode.ai/workspace/${encodeURIComponent(id)}/go`)

  // Fetch usage history separately
  let usageHistory: OpenCodeGoUsageRecord[] = []
  try {
    const usageHtml = await fetchWithAuth(`https://opencode.ai/workspace/${encodeURIComponent(id)}/usage`)
    usageHistory = extractUsageHistory(usageHtml)
  } catch {
    // usage history is optional
  }

  return {
    rolling: extractWindow(html, 'rollingUsage'),
    weekly: extractWindow(html, 'weeklyUsage'),
    monthly: extractWindow(html, 'monthlyUsage'),
    usageHistory,
    fetchedAt: Date.now(),
  }
}

function extractUsageHistory(html: string): OpenCodeGoUsageRecord[] {
  const records: OpenCodeGoUsageRecord[] = []
  // Match usage record objects: usg_XXXX",...model:"...",...cost:123456,...
  const usgRegex = /(usg_[A-Z0-9]+)",workspaceID:"([^"]+)",timeCreated:\$R\[\d+\]=new Date\("([^"]+)"\).*?model:"([^"]*)",provider:"([^"]*)",inputTokens:(\d+),outputTokens:(\d+),reasoningTokens:(\d+),cacheReadTokens:(\d+).*?cost:(\d+)/g
  let match
  while ((match = usgRegex.exec(html)) !== null) {
    records.push({
      id: match[1],
      timeCreated: match[3],
      model: match[4],
      provider: match[5],
      inputTokens: parseInt(match[6]) || 0,
      outputTokens: parseInt(match[7]) || 0,
      reasoningTokens: parseInt(match[8]) || 0,
      cacheReadTokens: parseInt(match[9]) || 0,
      cost: parseInt(match[10]) || 0,
      keyID: '',
    })
  }
  if (records.length === 0) {
    // Fallback: looser match
    const re2 = /id:"(usg_[^"]+)".*?timeCreated:\$R\[\d+\]=new Date\("([^"]+)"\).*?model:"([^"]*)".*?provider:"([^"]*)".*?inputTokens:(\d+).*?outputTokens:(\d+).*?reasoningTokens:(\d+).*?cacheReadTokens:(\d+).*?cost:(\d+)/g
    while ((match = re2.exec(html)) !== null) {
      records.push({
        id: match[1],
        timeCreated: match[2],
        model: match[3],
        provider: match[4],
        inputTokens: parseInt(match[5]) || 0,
        outputTokens: parseInt(match[6]) || 0,
        reasoningTokens: parseInt(match[7]) || 0,
        cacheReadTokens: parseInt(match[8]) || 0,
        cost: parseInt(match[9]) || 0,
        keyID: '',
      })
    }
  }
  return records
}

export function isOpenCodeGoConfigured(): boolean {
  return !!(getAppSetting('opencodego.workspaceId') && getAppSetting('opencodego.authCookie'))
}
