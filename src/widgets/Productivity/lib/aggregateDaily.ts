import type { TodoTask } from '@/widgets/Todo/store/store.ts'

import type { ProductivityDaily } from '../types.ts'

/**
 * Returns the start-of-day epoch ms for the calendar day that `date` falls on,
 * expressed in the given IANA `timeZone` (or the runtime local zone when omitted).
 *
 * Strategy: use `Intl.DateTimeFormat` to extract the Y-M-D parts for the zone,
 * then reconstruct a Date at midnight in that zone via a UTC-shifted approach:
 * format `date` in the target zone → parse the parts back to a UTC midnight
 * by finding the UTC instant that corresponds to local midnight.
 */
function dayWindowMs(
  date: Date,
  timeZone?: string,
): { dayStart: number; dayStartOfNextDay: number } {
  if (!timeZone) {
    // Use plain local-Date methods — no Intl needed.
    const y = date.getFullYear()
    const m = date.getMonth()
    const d = date.getDate()
    const dayStart = new Date(y, m, d).getTime()
    const dayStartOfNextDay = new Date(y, m, d + 1).getTime()
    return { dayStart, dayStartOfNextDay }
  }

  // Get the Y-M-D parts in the target zone.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA gives "YYYY-MM-DD" which is unambiguous.
  const parts = fmt.formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const year = get('year')
  const month = get('month') - 1 // 0-based
  const day = get('day')

  // Find the UTC instant for local midnight in this zone by binary search.
  // We know the answer is within ±14 hours of the UTC midnight for this date.
  const utcMidnightApprox = Date.UTC(year, month, day)
  const dayStart = findLocalMidnight(utcMidnightApprox, year, month, day, timeZone)
  const dayStartOfNextDay = findLocalMidnight(
    utcMidnightApprox + 86_400_000,
    year,
    month,
    day + 1,
    timeZone,
  )

  return { dayStart, dayStartOfNextDay }
}

/**
 * Given an approximate UTC epoch near local midnight for (year, month, day)
 * in `timeZone`, binary-search for the exact UTC instant where the local
 * calendar flips to that date at 00:00:00.
 *
 * Returns the epoch ms of local midnight (00:00:00.000 local time).
 */
function findLocalMidnight(
  approxUtc: number,
  year: number,
  month: number,
  day: number,
  timeZone: string,
): number {
  // The target local date string we want at 00:00:00.
  const target = `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const dtFmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  // Binary-search window: ±14h around approximate UTC midnight.
  let lo = approxUtc - 14 * 3_600_000
  let hi = approxUtc + 14 * 3_600_000

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    const localDate = dtFmt.format(new Date(mid)).slice(0, 10)
    if (localDate < target) {
      lo = mid
    } else {
      hi = mid
    }
  }

  return hi
}

/**
 * Extract local-date string "YYYY-MM-DD" for a given epoch in the target zone
 * (or local zone when `timeZone` is omitted).
 */
function localDateString(date: Date, timeZone?: string): string {
  if (!timeZone) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${String(y).padStart(4, '0')}-${m}-${d}`
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date)
}

/**
 * Returns the weekday of `date` in the target zone as Monday=0 … Sunday=6.
 * JS `getDay()` gives Sunday=0; `Intl` `weekday: 'short'` is locale-dependent
 * so we use the numeric day-of-week via formatting a reference epoch.
 */
function localWeekday(date: Date, timeZone?: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  let jsDow: number
  if (!timeZone) {
    jsDow = date.getDay() // 0=Sun … 6=Sat
  } else {
    // Use 'en-US' numeric weekday: Sunday=1 … Saturday=7
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    const short = fmt.format(date)
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }
    jsDow = map[short] ?? date.getDay()
  }
  // Remap: JS Sun=0 → 6, Mon=1 → 0, … Sat=6 → 5
  return ((jsDow + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
}

/**
 * Aggregate Todo tasks into a single-day productivity summary.
 *
 * Pure function — no side effects, deterministic for given inputs.
 *
 * @param tasks   The full Todo task list (unfiltered).
 * @param date    Any instant within the target calendar day.
 * @param timeZone IANA zone string (e.g. "America/New_York"). Omit to use
 *                the runtime local zone.
 */
export function aggregateDaily(
  tasks: TodoTask[],
  date: Date,
  timeZone?: string,
): ProductivityDaily {
  const { dayStart, dayStartOfNextDay } = dayWindowMs(date, timeZone)

  const inDay = (ts: number): boolean => ts >= dayStart && ts < dayStartOfNextDay

  let planned = 0
  let closed = 0
  let fullFlow = 0
  let wip = 0

  for (const task of tasks) {
    const createdInDay = inDay(task.createdAt)
    const completedInDay = task.completedAt !== null && inDay(task.completedAt)

    if (createdInDay) planned++
    if (completedInDay) closed++
    if (createdInDay && completedInDay) fullFlow++

    // WIP at end of day: task existed (createdAt < dayStartOfNextDay) AND
    // was NOT in a terminal state (completed/deleted) by the end of the day.
    //
    // Terminal-by-end-of-day: current status is terminal AND statusChangedAt < dayStartOfNextDay.
    // Note: this is approximate for tasks completed-then-reopened across a day boundary —
    // we use the current status as the truth for when the terminal state was entered.
    const existedByEndOfDay = task.createdAt < dayStartOfNextDay
    const isTerminal = task.status === 'completed' || task.status === 'deleted'
    const terminalByEndOfDay = isTerminal && task.statusChangedAt < dayStartOfNextDay

    if (existedByEndOfDay && !terminalByEndOfDay) wip++
  }

  return {
    date: localDateString(date, timeZone),
    closed,
    fullFlow,
    planned,
    wip,
    weekday: localWeekday(date, timeZone),
  }
}
