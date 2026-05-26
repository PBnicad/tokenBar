import fs from 'fs'
import path from 'path'
import os from 'os'
import { getAppSetting } from '../db'
import type { AgentAdapter, RawSession, RawMessage } from './types'

// ---- Helpers ----

function getDefaultSessionsDir(): string {
  const home = os.homedir()
  return path.join(home, '.pi', 'agent', 'sessions')
}

function getSessionsDir(): string {
  // 1. Check user-configured path
  const configured = getAppSetting('agent.pi-agent.path')
  if (configured && fs.existsSync(configured)) return configured

  // 2. Default location
  return getDefaultSessionsDir()
}

function findSessionFiles(): string[] {
  const dir = getSessionsDir()
  if (!fs.existsSync(dir)) return []

  try {
    const files: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const subDir = path.join(dir, entry.name)
      const subEntries = fs.readdirSync(subDir, { withFileTypes: true })
      for (const sub of subEntries) {
        if (sub.isFile() && sub.name.endsWith('.jsonl')) {
          files.push(path.join(subDir, sub.name))
        }
      }
    }
    return files
  } catch {
    return []
  }
}

interface PiSessionHeader {
  type: 'session'
  version: number
  id: string
  timestamp: string
  cwd: string
}

interface PiAssistantMessage {
  role: 'assistant'
  provider: string
  model: string
  usage?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
    totalTokens?: number
    cost?: {
      input?: number
      output?: number
      cacheRead?: number
      cacheWrite?: number
      total?: number
    }
  }
  stopReason?: string
  timestamp?: number
}

function parseSessionFile(filePath: string): {
  header: PiSessionHeader | null
  messages: RawMessage[]
  dir: string
} {
  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim()
    if (!content) return { header: null, messages: [], dir: '' }

    const lines = content.split('\n')

    // First line is always the session header
    let header: PiSessionHeader | null = null
    try {
      const obj = JSON.parse(lines[0])
      if (obj.type === 'session') {
        header = obj as PiSessionHeader
      }
    } catch { /* skip */ }

    const messages: RawMessage[] = []
    for (let i = 1; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i])
        if (entry.type !== 'message') continue
        const msg = entry.message
        if (!msg || msg.role !== 'assistant') continue

        const usage = msg.usage || {}
        const cost = usage.cost || {}

        messages.push({
          id: entry.id || `${filePath}::${i}`,
          sessionId: header?.id || path.basename(filePath, '.jsonl'),
          providerId: msg.provider || '',
          modelId: msg.model || '',
          cost: typeof msg.cost === 'number'
            ? msg.cost
            : (typeof cost.total === 'number' ? cost.total : 0),
          tokensInput: typeof usage.input === 'number' ? usage.input : 0,
          tokensOutput: typeof usage.output === 'number' ? usage.output : 0,
          tokensReasoning: typeof usage.reasoning === 'number' ? usage.reasoning : 0,
          tokensCacheRead: typeof usage.cacheRead === 'number' ? usage.cacheRead : 0,
          tokensCacheWrite: typeof usage.cacheWrite === 'number' ? usage.cacheWrite : 0,
          finish: msg.stopReason || '',
          created: msg.timestamp || (header ? new Date(header.timestamp).getTime() : 0),
          completed: msg.timestamp || (header ? new Date(header.timestamp).getTime() : 0),
        })
      } catch { /* skip malformed lines */ }
    }

    return {
      header,
      messages,
      dir: header?.cwd || '',
    }
  } catch {
    return { header: null, messages: [], dir: '' }
  }
}

function extractSessionDirName(dirName: string): string {
  // --C--Users-25679-Desktop-project-- → C:\Users\25679\Desktop\project
  const stripped = dirName.replace(/^--/, '').replace(/--$/, '')
  return stripped.replace(/-/g, '/').replace(/^\//, '')
}

// ---- Adapter ----

let cachedFiles: { path: string; mtime: number }[] = []
let lastScan = 0

function scanFiles(): { path: string; mtime: number }[] {
  const now = Date.now()
  // Cache scan results for 5 seconds
  if (now - lastScan < 5000 && cachedFiles.length > 0) return cachedFiles

  const files = findSessionFiles()
  cachedFiles = files.map((f) => {
    try {
      return { path: f, mtime: fs.statSync(f).mtimeMs }
    } catch {
      return { path: f, mtime: 0 }
    }
  })
  lastScan = now
  return cachedFiles
}

export const piAgentAdapter: AgentAdapter = {
  name: 'pi-agent',
  displayName: 'Pi Agent',

  isAvailable() {
    return fs.existsSync(getSessionsDir())
  },

  async fetchSessions() {
    const files = scanFiles()
    const sessions: RawSession[] = []

    for (const file of files) {
      const dirName = path.basename(path.dirname(file.path))
      const { header, messages, dir } = parseSessionFile(file.path)

      const sessionId = header?.id || path.basename(file.path, '.jsonl')
      // Compute title: use first user message, or directory name
      let title = dirName
      if (header?.cwd) {
        title = path.basename(header.cwd) || header.cwd
      }
      // Try to extract a better title from the first user message
      try {
        const content = fs.readFileSync(file.path, 'utf-8').trim()
        const lines = content.split('\n')
        for (let i = 1; i < Math.min(lines.length, 10); i++) {
          const entry = JSON.parse(lines[i])
          if (entry.type === 'message' && entry.message?.role === 'user') {
            const userContent = entry.message.content
            if (typeof userContent === 'string' && userContent.length > 0) {
              title = userContent.slice(0, 80)
              break
            } else if (Array.isArray(userContent) && userContent.length > 0) {
              const text = userContent.find((b: { type: string; text?: string }) => b.type === 'text')
              if (text?.text) {
                title = text.text.slice(0, 80)
                break
              }
            }
          }
        }
      } catch { /* use fallback title */ }

      const created = header
        ? new Date(header.timestamp).getTime()
        : file.mtime
      const updated = messages.length > 0
        ? Math.max(...messages.map((m) => m.completed), created)
        : file.mtime

      sessions.push({
        id: sessionId,
        title,
        directory: dir || extractSessionDirName(dirName),
        created,
        updated,
      })
    }

    return sessions
  },

  async fetchMessages(sessionId: string) {
    const files = scanFiles()
    // Find the file containing this session
    for (const file of files) {
      const { header, messages } = parseSessionFile(file.path)
      if (header?.id === sessionId || path.basename(file.path, '.jsonl') === sessionId) {
        return messages
      }
    }
    // Fallback: check all files
    for (const file of files) {
      const { messages } = parseSessionFile(file.path)
      const idFromPath = path.basename(file.path, '.jsonl')
      if (idFromPath === sessionId) {
        return messages
      }
    }
    return []
  },

  getLastModifiedTime() {
    const files = scanFiles()
    if (files.length === 0) return 0
    return Math.max(...files.map((f) => f.mtime))
  },

  dispose() {
    cachedFiles = []
    lastScan = 0
  },
}
