import type { AgentAdapter } from './types'

const adapters: AgentAdapter[] = []

/** Register a new agent adapter. Call once per adapter at startup. */
export function registerAdapter(adapter: AgentAdapter): void {
  // Prevent duplicates
  if (adapters.find((a) => a.name === adapter.name)) return
  adapters.push(adapter)
}

/** All registered adapters, ordered by registration. */
export function getAdapters(): readonly AgentAdapter[] {
  return adapters
}

/** Find a specific adapter by name. */
export function getAdapter(name: string): AgentAdapter | undefined {
  return adapters.find((a) => a.name === name)
}

/** Available adapters (data source exists). */
export function getAvailableAdapters(): readonly AgentAdapter[] {
  return adapters.filter((a) => a.isAvailable())
}

/** Dispose all adapters. */
export function disposeAll(): void {
  for (const a of adapters) {
    a.dispose?.()
  }
}
