import type { ActivitySettings } from '@/background/activity/types.ts'
import {
  ACTIVITY_CLEANUP_ALARM,
  ACTIVITY_HEARTBEAT_ALARM,
  ACTIVITY_LIMITS,
  ACTIVITY_ROLLUP_ALARM,
  CLEANUP_PERIOD_MIN,
  HEARTBEAT_PERIOD_MIN,
  ROLLUP_PERIOD_MIN,
} from '@/background/activity/constants.ts'
import {
  ensureRolloverForEvent,
  emptyAll,
  emptyDay,
  emptyWeek,
} from '@/background/activity/rollup.ts'
import {
  loadAll,
  loadDay,
  loadWeek,
  pruneRaw,
  saveAll,
  saveDay,
  saveWeek,
} from '@/background/activity/storage.ts'
import { emitHeartbeat } from '@/background/activity/tracker.ts'

/**
 * Scheduled safety-net jobs. See README.md for the full cadence table.
 *   `activity-heartbeat` (5 min)  — commits in-flight active session duration.
 *   `activity-rollup`    (60 min) — day-boundary sanity check + raw prune.
 *   `activity-cleanup`   (24 h)   — enforces 90-day cap on `activity_all`.
 */

export function setupActivityAlarms(settingsGetter: () => ActivitySettings): void {
  chrome.alarms.create(ACTIVITY_HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_PERIOD_MIN })
  chrome.alarms.create(ACTIVITY_ROLLUP_ALARM, { periodInMinutes: ROLLUP_PERIOD_MIN })
  chrome.alarms.create(ACTIVITY_CLEANUP_ALARM, { periodInMinutes: CLEANUP_PERIOD_MIN })

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    switch (alarm.name) {
      case ACTIVITY_HEARTBEAT_ALARM:
        emitHeartbeat(settingsGetter)
        break
      case ACTIVITY_ROLLUP_ALARM:
        // Still heartbeat here so a dropped heartbeat alarm doesn't block the
        // hourly commit. Day rollover + prune are the main job.
        emitHeartbeat(settingsGetter)
        await runRollupAlarm()
        break
      case ACTIVITY_CLEANUP_ALARM:
        await runCleanupAlarm()
        break
    }
  })
}

async function runRollupAlarm(): Promise<void> {
  const now = Date.now()
  const [day, week, all] = await Promise.all([loadDay(), loadWeek(), loadAll()])
  const current = {
    day: day ?? emptyDay(now),
    week: week ?? emptyWeek(now),
    all: all ?? emptyAll(),
  }

  const rolled = ensureRolloverForEvent(current.day, current.week, current.all, now)
  if (rolled.rolledOver) {
    await Promise.all([saveDay(rolled.day), saveWeek(rolled.week), saveAll(rolled.all)])
  }

  // Prune raw buffer regardless — events older than the retention window
  // are no longer useful for rebuilds.
  await pruneRaw(ACTIVITY_LIMITS.rawMaxAgeMs, now)
}

async function runCleanupAlarm(): Promise<void> {
  const all = await loadAll()
  if (!all) return
  if (all.buckets.length <= ACTIVITY_LIMITS.allMaxBuckets) return
  const trimmed = {
    buckets: all.buckets.slice(all.buckets.length - ACTIVITY_LIMITS.allMaxBuckets),
  }
  await saveAll(trimmed)
}
