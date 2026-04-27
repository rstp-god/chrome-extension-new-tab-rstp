import {
  ACTIVITY_LIMITS,
  RAW_FLUSH_DELAY_MS,
  SNAPSHOT_FLUSH_DELAY_MS,
} from '@/background/activity/constants.ts'

import {
  applyEventToDay,
  ensureRolloverForEvent,
  rebuildFromRaw,
} from '@/background/activity/rollup.ts'
import {
  appendRaw,
  loadAll,
  loadDay,
  loadRaw,
  loadWeek,
  pruneRaw,
  saveAll,
  saveDay,
  saveWeek,
} from '@/background/activity/storage.ts'
import { PRE_HYDRATION_BUFFER_MAX, state } from '@/background/activity/tracker/state.ts'
import type { ActivityEvent, ActivitySettings } from '@/background/activity/types.ts'

/**
 * Event-dispatch + persistence plumbing. Everything that writes to
 * chrome.storage flows through here (debounced). See README.md for the
 * flush cadence and hydration fallback rules.
 */

export type SettingsGetter = () => ActivitySettings

export function dispatchEvent(event: ActivityEvent, settingsGetter: SettingsGetter): void {
  if (settingsGetter().paused) return

  // Pre-hydration window: snapshots aren't loaded yet. Buffer the event so
  // the first tab switch after wake-up isn't silently lost; hydrate drains
  // the buffer once all three snapshots are ready.
  if (!state.day || !state.week || !state.all) {
    if (state.preHydrationEvents.length < PRE_HYDRATION_BUFFER_MAX) {
      state.preHydrationEvents.push(event)
    }
    return
  }

  // Rollover on real wall-clock time, not event timestamp — otherwise
  // out-of-order events could reverse-rollover and corrupt snapshots.
  const now = Date.now()
  const rolled = ensureRolloverForEvent(state.day, state.week, state.all, now)
  state.day = rolled.day
  state.week = rolled.week
  state.all = rolled.all

  applyEventToDay(state.day, event)
  state.pendingRaw.push(event)

  scheduleSnapshotFlush()
  scheduleRawFlush()
}

/**
 * Restore snapshots independently on worker wake — a single corrupt envelope
 * must not wipe the other two keys. Missing ones fall back to `rebuildFromRaw`.
 * After all three are populated, drain any events that arrived during the
 * hydration window through `dispatchEvent`.
 */
export async function hydrateSnapshots(now: number, settingsGetter: SettingsGetter): Promise<void> {
  const [day, week, all] = await Promise.all([loadDay(), loadWeek(), loadAll()])

  if (day) state.day = day
  if (week) state.week = week
  if (all) state.all = all

  if (!state.day || !state.week || !state.all) {
    const raw = await loadRaw()
    const rebuilt = rebuildFromRaw(raw, now)
    if (!state.day) state.day = rebuilt.day
    if (!state.week) state.week = rebuilt.week
    if (!state.all) state.all = rebuilt.all
  }

  if (state.preHydrationEvents.length > 0) {
    const buffered = state.preHydrationEvents
    state.preHydrationEvents = []
    for (const ev of buffered) dispatchEvent(ev, settingsGetter)
  }

  scheduleSnapshotFlush()
}

function scheduleSnapshotFlush(): void {
  if (state.snapshotFlushTimer) return
  state.snapshotFlushTimer = setTimeout(() => {
    state.snapshotFlushTimer = null
    void flushSnapshots()
  }, SNAPSHOT_FLUSH_DELAY_MS)
}

function scheduleRawFlush(): void {
  if (state.rawFlushTimer) return
  state.rawFlushTimer = setTimeout(() => {
    state.rawFlushTimer = null
    void flushRaw()
  }, RAW_FLUSH_DELAY_MS)
}

async function flushSnapshots(): Promise<void> {
  const { day, week, all } = state
  if (!day || !week || !all) return
  await Promise.all([saveDay(day), saveWeek(week), saveAll(all)])
}

async function flushRaw(): Promise<void> {
  if (state.pendingRaw.length === 0) return
  const batch = state.pendingRaw
  state.pendingRaw = []
  await appendRaw(batch)
  await pruneRaw(ACTIVITY_LIMITS.rawMaxAgeMs, Date.now())
}

/** Flush pending writes immediately. Useful before a known idle point. */
export async function flushPendingWrites(): Promise<void> {
  if (state.snapshotFlushTimer) {
    clearTimeout(state.snapshotFlushTimer)
    state.snapshotFlushTimer = null
  }
  if (state.rawFlushTimer) {
    clearTimeout(state.rawFlushTimer)
    state.rawFlushTimer = null
  }
  await flushRaw()
  await flushSnapshots()
}
