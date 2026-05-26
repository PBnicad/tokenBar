// ---- Agent Adapter Interface ----
// Each AI agent / coding assistant implements this adapter to supply
// session and message data. The sync engine works against this interface
// only — adding a new agent is just one new file in this folder.

export interface RawSession {
  id: string
  title: string
  directory: string
  created: number   // Unix ms
  updated: number   // Unix ms
}

export interface RawMessage {
  id: string
  sessionId: string
  providerId: string
  modelId: string
  cost: number
  tokensInput: number
  tokensOutput: number
  tokensReasoning: number
  tokensCacheRead: number
  tokensCacheWrite: number
  finish: string
  created: number     // Unix ms
  completed: number   // Unix ms
}

export interface AgentAdapter {
  /** Unique key, e.g. "opencode", "pi-agent", "claude-code" */
  readonly name: string
  /** Human-readable label shown in the UI */
  readonly displayName: string
  /** Whether the agent's data source exists and is readable */
  isAvailable(): boolean
  /** List all sessions */
  fetchSessions(): Promise<RawSession[]>
  /** List messages for a specific session */
  fetchMessages(sessionId: string): Promise<RawMessage[]>
  /** Last modification time of the data source (Unix ms) — used for change detection */
  getLastModifiedTime(): number
  /** Release any resources (db connections, file handles) */
  dispose?(): void
}
