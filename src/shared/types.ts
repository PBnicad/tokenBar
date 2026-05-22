export interface SessionRow {
  id: string
  project_id: string
  directory: string
  title: string
  created_at: number
  updated_at: number
  synced_at: number
}

export interface MessageRow {
  id: string
  session_id: string
  provider_id: string
  model_id: string
  cost: number
  tokens_input: number
  tokens_output: number
  tokens_reasoning: number
  tokens_cache_read: number
  tokens_cache_write: number
  finish_reason: string
  created_at: number
  completed_at: number
}

export interface StepRow {
  id: string
  message_id: string
  session_id: string
  cost: number
  tokens_input: number
  tokens_output: number
  tokens_reasoning: number
  tokens_cache_read: number
  tokens_cache_write: number
  reason: string
  created_at: number
}

export interface HourlyUsageRow {
  hour: string
  model_id: string
  provider_id: string
  cost: number
  tokens_input: number
  tokens_output: number
  tokens_total: number
  message_count: number
}

export interface DailyUsageRow {
  date: string
  model_id: string
  provider_id: string
  cost: number
  tokens_input: number
  tokens_output: number
  tokens_total: number
  message_count: number
  session_count: number
}

export interface Overview {
  totalCost: number
  totalTokens: number
  totalSessions: number
  totalMessages: number
  uniqueModels: number
}

export interface ModelAggregation {
  provider_id: string
  model_id: string
  cost: number
  tokens_input: number
  tokens_output: number
  tokens_total: number
  message_count: number
}

export interface HeatmapCell {
  date: string
  hour: number
  tokens: number
  cost: number
}

export interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected'
  port: number
  error?: string
}

export interface SyncProgress {
  current: number
  total: number
  sessionTitle: string
}

export interface SessionListItem {
  id: string
  title: string
  provider_id: string
  model_id: string
  cost: number
  tokens_total: number
  message_count: number
  created_at: number
  directory: string
}

export interface SessionDetail {
  session: SessionRow
  messages: MessageRow[]
  totalCost: number
  totalTokens: number
}

export interface SettingsData {
  serverPort: number
  syncOnStart: boolean
  dbPath: string
}
