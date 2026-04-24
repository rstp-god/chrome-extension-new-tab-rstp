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
 * ### MV3 service-worker lifecycle
 *
 * The service worker is suspended after ~30s of idle and loses all module
 * state. Opening or closing a new-tab page does NOT cause this — it only
 * fires `chrome.tabs.onCreated/onRemoved`, which wake the worker without
 * resetting anything. State is only cleared on:
 *
 *   - Worker suspension (idle timeout) → state reconstructed on next event:
 *       · `day/week/all` re-hydrated from `chrome.storage.local`.
 *       · `tabDomain` / `openTabIds` re-primed by `primeExistingTabs`.
 *       · `activeSession` recovered via `primeActiveSessionIfNeeded`.
 *       · `tabCreatedAt` is NOT restored — tabs that predate worker boot
 *         close without a measured `duration` (caller expects this).
 *   - Extension update / reload → same as above.
 *   - Explicit reset in tests via `__resetTrackerForTests`.
 *
 * In short: persisted rollup snapshots survive suspension; in-memory
 * per-tab bookkeeping is rebuilt lazily.
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
  /** All known open tab IDs (including non-http pages). Source for `peakOpen`. */
  openTabIds: Set<number>
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
  /**
   * Events that arrived between worker start and `hydrateSnapshots` completing.
   * Drained into the real pipeline once snapshots are ready — prevents silent
   * loss of the first-tab-switch event after a wake-up.
   */
  preHydrationEvents: ActivityEvent[]
}

/** Cap to keep the pre-hydration buffer bounded if hydration hangs. */
export const PRE_HYDRATION_BUFFER_MAX = 256

export const state: TrackerState = {
  activeSession: null,
  tabCreatedAt: new Map(),
  tabDomain: new Map(),
  openTabIds: new Set(),
  day: null,
  week: null,
  all: null,
  pendingRaw: [],
  snapshotFlushTimer: null,
  rawFlushTimer: null,
  activationSeq: 0,
  userIdle: false,
  initialized: false,
  preHydrationEvents: [],
}

export function resetState(): void {
  if (state.snapshotFlushTimer) clearTimeout(state.snapshotFlushTimer)
  if (state.rawFlushTimer) clearTimeout(state.rawFlushTimer)
  state.activeSession = null
  state.tabCreatedAt.clear()
  state.tabDomain.clear()
  state.openTabIds.clear()
  state.day = null
  state.week = null
  state.all = null
  state.pendingRaw = []
  state.snapshotFlushTimer = null
  state.rawFlushTimer = null
  state.activationSeq = 0
  state.userIdle = false
  state.initialized = false
  state.preHydrationEvents = []
}
