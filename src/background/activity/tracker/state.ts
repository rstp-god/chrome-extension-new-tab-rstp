import type {
  ActivityAllSnapshot,
  ActivityDaySnapshot,
  ActivityEvent,
  ActivityWeekSnapshot,
} from '@/background/activity/types.ts'

/**
 * Module-level singleton state for the tracker. Kept in one place so every
 * sub-module (session/dispatch/listeners) mutates the same source of truth
 * without needing to thread the state through function arguments.
 *
 * Tests reset it via `__resetTrackerForTests`.
 */

export interface ActiveSession {
  tabId: number
  domain: string
  startedAt: number
}

export interface TrackerState {
  activeSession: ActiveSession | null
  tabCreatedAt: Map<number, number>
  /** Domain of each known tab, keyed by tabId. Used for navigation detection. */
  tabDomain: Map<number, string>
  day: ActivityDaySnapshot | null
  week: ActivityWeekSnapshot | null
  all: ActivityAllSnapshot | null
  pendingRaw: ActivityEvent[]
  snapshotFlushTimer: ReturnType<typeof setTimeout> | null
  rawFlushTimer: ReturnType<typeof setTimeout> | null
  /** Incremented on every context-changing event so stale async resolutions abort. */
  activationSeq: number
  /**
   * True when `chrome.idle` reports the user as idle/locked. While set,
   * `startSession` is a no-op and accumulated time stops advancing.
   */
  userIdle: boolean
  /** Set once listeners are registered so re-entry is idempotent. */
  initialized: boolean
}

export const state: TrackerState = {
  activeSession: null,
  tabCreatedAt: new Map(),
  tabDomain: new Map(),
  day: null,
  week: null,
  all: null,
  pendingRaw: [],
  snapshotFlushTimer: null,
  rawFlushTimer: null,
  activationSeq: 0,
  userIdle: false,
  initialized: false,
}

export function resetState(): void {
  if (state.snapshotFlushTimer) clearTimeout(state.snapshotFlushTimer)
  if (state.rawFlushTimer) clearTimeout(state.rawFlushTimer)
  state.activeSession = null
  state.tabCreatedAt.clear()
  state.tabDomain.clear()
  state.day = null
  state.week = null
  state.all = null
  state.pendingRaw = []
  state.snapshotFlushTimer = null
  state.rawFlushTimer = null
  state.activationSeq = 0
  state.userIdle = false
  state.initialized = false
}
