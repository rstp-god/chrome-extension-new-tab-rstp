import { format, getHours, isSameDay, startOfWeek } from 'date-fns'

import type {
  ActivityAllSnapshot,
  ActivityBucket,
  ActivityDaySnapshot,
  ActivityEvent,
  ActivityEventType,
  ActivityWeekSnapshot,
  DomainUsage,
  TabMetrics,
} from '@/background/activity/types.ts'
import { ACTIVITY_LIMITS } from '@/background/activity/types.ts'

/**
 * Pure rollup logic. No side effects, no chrome.* calls — safe to unit test
 * without mocks. `tracker.ts` is responsible for producing durational events
 * (i.e. pairing activated/closed/navigated into slices with `duration` set);
 * this module only aggregates those events into pre-computed snapshots.
 */

const DATE_KEY_FORMAT = 'yyyy-MM-dd'

/**
 * Event types that carry a time-slice duration (vs. tab_created/closed which
 * are counter-only). Used to detect no-op "state marker" events we can skip.
 */
const DURATIONAL_EVENT_TYPES: readonly ActivityEventType[] = [
  'tab_activated',
  'tab_navigated',
  'window_focus',
]

/**
 * Keys that must never appear as object-property keys because assigning them
 * walks up the prototype chain (Object.prototype pollution).
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** WHATWG-URL hostnames after `extractDomain` normalisation: ASCII + dots + hyphens. */
const HOSTNAME_RE = /^[a-z0-9.-]{1,253}$/

/**
 * Combined validator used both at the mutation site (addDomainUsage) and in
 * the Zod record-key schema. Rejects prototype-pollution keys AND anything
 * that isn't a plausible hostname — the two guards the codebase cares about.
 */
export function isValidDomainKey(key: string): boolean {
  return !DANGEROUS_KEYS.has(key) && HOSTNAME_RE.test(key)
}

/** Two-digit hour key `"00".."23"` — stable collation, no ambiguity. */
export function hourKey(timestamp: number): string {
  const h = getHours(timestamp)
  return h < 10 ? `0${h}` : String(h)
}

/** Local-TZ ISO date key, e.g. `"2026-04-16"`. */
export function dateKey(timestamp: number): string {
  return format(timestamp, DATE_KEY_FORMAT)
}

/** Start of ISO week in local TZ (Monday), formatted as a date key. */
export function weekStartKey(timestamp: number): string {
  return format(startOfWeek(timestamp, { weekStartsOn: 1 }), DATE_KEY_FORMAT)
}

export function emptyTabMetrics(): TabMetrics {
  return { created: 0, closed: 0, peakOpen: 0, avgLifetime: 0 }
}

export function emptyBucket(key: string): ActivityBucket {
  return { key, domains: {}, tabs: emptyTabMetrics() }
}

export function emptyDay(now: number): ActivityDaySnapshot {
  return { date: dateKey(now), buckets: [], totalsByDomain: {} }
}

export function emptyWeek(now: number): ActivityWeekSnapshot {
  return { weekStart: weekStartKey(now), buckets: [], totalsByDomain: {} }
}

export function emptyAll(): ActivityAllSnapshot {
  return { buckets: [] }
}

function addDomainUsage(
  target: Record<string, DomainUsage>,
  domain: string,
  addTime: number,
  addVisits: number,
): void {
  if (!isValidDomainKey(domain)) return
  const prev = Object.prototype.hasOwnProperty.call(target, domain) ? target[domain] : undefined
  if (prev) {
    prev.totalTime += addTime
    prev.visits += addVisits
  } else {
    target[domain] = { totalTime: addTime, visits: addVisits }
  }
}

/**
 * Locate (or create) a bucket with the given key, keeping buckets sorted
 * by key in ascending order. O(n) is fine — n ≤ 24 for day, ≤ 90 for all.
 */
function upsertBucket(buckets: ActivityBucket[], key: string): ActivityBucket {
  for (const b of buckets) {
    if (b.key === key) return b
  }
  const bucket = emptyBucket(key)
  // Insert in sorted position.
  let i = 0
  while (i < buckets.length && buckets[i].key < key) i++
  buckets.splice(i, 0, bucket)
  return bucket
}

/**
 * Incrementally fold an event into the day snapshot. Week/all snapshots
 * are not touched here — they roll up at day boundaries via `rolloverDay`.
 */
export function applyEventToDay(
  day: ActivityDaySnapshot,
  event: ActivityEvent,
): ActivityDaySnapshot {
  const durationSec =
    event.duration !== undefined ? Math.max(0, Math.round(event.duration / 1000)) : 0

  // Skip no-op events (pure state markers with no duration and no counter change)
  // to avoid allocating empty buckets.
  const isMarkerOnly = DURATIONAL_EVENT_TYPES.includes(event.eventType) && durationSec === 0
  if (isMarkerOnly) {
    return day
  }

  const bucket = upsertBucket(day.buckets, hourKey(event.timestamp))

  switch (event.eventType) {
    case 'tab_activated':
    case 'tab_navigated':
    case 'window_focus': {
      // duration is the time spent on `event.domain` leading up to this event.
      addDomainUsage(bucket.domains, event.domain, durationSec, 1)
      addDomainUsage(day.totalsByDomain, event.domain, durationSec, 1)
      break
    }
    case 'tab_created': {
      bucket.tabs.created += 1
      break
    }
    case 'tab_closed': {
      bucket.tabs.closed += 1
      if (durationSec > 0) {
        // duration on tab_closed is the tab's lifetime.
        // Update running average: ((avg * n) + lifetime) / (n + 1).
        const n = bucket.tabs.closed - 1
        bucket.tabs.avgLifetime = (bucket.tabs.avgLifetime * n + durationSec) / (n + 1)
      }
      break
    }
  }

  return day
}

/**
 * Collapse a day snapshot into a single daily `ActivityBucket` for storage
 * in week/all snapshots. Sums domain time and tab metrics across all hours.
 */
export function collapseDayToBucket(day: ActivityDaySnapshot): ActivityBucket {
  const bucket = emptyBucket(day.date)
  for (const [domain, usage] of Object.entries(day.totalsByDomain)) {
    bucket.domains[domain] = { totalTime: usage.totalTime, visits: usage.visits }
  }
  for (const hourBucket of day.buckets) {
    bucket.tabs.created += hourBucket.tabs.created
    bucket.tabs.closed += hourBucket.tabs.closed
    bucket.tabs.peakOpen = Math.max(bucket.tabs.peakOpen, hourBucket.tabs.peakOpen)
    // Weight avgLifetime by number of closed tabs per hour.
    if (hourBucket.tabs.closed > 0) {
      const weight = hourBucket.tabs.closed
      bucket.tabs.avgLifetime =
        (bucket.tabs.avgLifetime * (bucket.tabs.closed - weight) +
          hourBucket.tabs.avgLifetime * weight) /
        bucket.tabs.closed
    }
  }
  return bucket
}

/**
 * Migrate the completed `day` into `week` and `all`, apply retention caps,
 * and return a fresh day snapshot anchored at `now`. Week is reset if
 * `now` falls into a new ISO week.
 */
export function rolloverDay(
  day: ActivityDaySnapshot,
  week: ActivityWeekSnapshot,
  all: ActivityAllSnapshot,
  now: number,
): {
  day: ActivityDaySnapshot
  week: ActivityWeekSnapshot
  all: ActivityAllSnapshot
} {
  const dayBucket = collapseDayToBucket(day)

  // --- week ---
  const nowWeekStart = weekStartKey(now)
  let nextWeek: ActivityWeekSnapshot
  if (week.weekStart === nowWeekStart) {
    nextWeek = {
      weekStart: week.weekStart,
      buckets: [...week.buckets, dayBucket],
      totalsByDomain: { ...week.totalsByDomain },
    }
  } else {
    // Week rolled over — start fresh with just the collapsed day.
    nextWeek = {
      weekStart: nowWeekStart,
      buckets: [dayBucket],
      totalsByDomain: {},
    }
  }
  // Cap week buckets (sliding window, drop oldest).
  while (nextWeek.buckets.length > ACTIVITY_LIMITS.weekMaxBuckets) {
    nextWeek.buckets.shift()
  }
  // Recompute week totals from buckets (cheap, ≤ 7 buckets).
  nextWeek.totalsByDomain = {}
  for (const b of nextWeek.buckets) {
    for (const [domain, usage] of Object.entries(b.domains)) {
      addDomainUsage(nextWeek.totalsByDomain, domain, usage.totalTime, usage.visits)
    }
  }

  // --- all ---
  const nextAll: ActivityAllSnapshot = {
    buckets: [...all.buckets, dayBucket],
  }
  while (nextAll.buckets.length > ACTIVITY_LIMITS.allMaxBuckets) {
    nextAll.buckets.shift()
  }

  return {
    day: emptyDay(now),
    week: nextWeek,
    all: nextAll,
  }
}

/**
 * Check whether `day.date` still matches today; if not, perform a rollover.
 * Called on every incoming event + on the hourly `activity-rollup` alarm
 * as a safety net when the service worker was idle across midnight.
 */
export function ensureRolloverForEvent(
  day: ActivityDaySnapshot,
  week: ActivityWeekSnapshot,
  all: ActivityAllSnapshot,
  now: number,
): {
  day: ActivityDaySnapshot
  week: ActivityWeekSnapshot
  all: ActivityAllSnapshot
  rolledOver: boolean
} {
  if (isSameDay(new Date(`${day.date}T00:00:00`), now)) {
    return { day, week, all, rolledOver: false }
  }
  const next = rolloverDay(day, week, all, now)
  return { ...next, rolledOver: true }
}

/**
 * Safety-net: reconstruct snapshots from a raw event log.
 * Used when in-memory state is lost (worker crash) and we can't trust
 * `activity_day` to be consistent with `activity_raw`.
 */
export function rebuildFromRaw(
  events: ActivityEvent[],
  now: number,
): {
  day: ActivityDaySnapshot
  week: ActivityWeekSnapshot
  all: ActivityAllSnapshot
} {
  let day = emptyDay(now)
  let week = emptyWeek(now)
  let all = emptyAll()

  // Group events by local date; rollover between groups.
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp)
  let currentDate = sorted.length > 0 ? dateKey(sorted[0].timestamp) : dateKey(now)
  day = { ...emptyDay(sorted[0]?.timestamp ?? now), date: currentDate }

  for (const event of sorted) {
    const eventDate = dateKey(event.timestamp)
    if (eventDate !== currentDate) {
      const next = rolloverDay(day, week, all, event.timestamp)
      day = next.day
      week = next.week
      all = next.all
      currentDate = eventDate
    }
    applyEventToDay(day, event)
  }

  // If today > last event's date, perform a final rollover so that the caller
  // always ends with `day.date === dateKey(now)`.
  if (currentDate !== dateKey(now)) {
    const next = rolloverDay(day, week, all, now)
    day = next.day
    week = next.week
    all = next.all
  }

  return { day, week, all }
}
