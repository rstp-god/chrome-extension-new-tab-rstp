import { getLocal, setLocal } from '@/services/chrome/storage.ts'
import { isShowcaseMode } from '@/services/chrome/runtime.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'

import { aggregateDaily } from './aggregateDaily.ts'
import type { ProductivityDaily } from '../types.ts'

export const PRODUCTIVITY_DAILY_KEY = 'productivity_daily'

const MAX_CACHE_DAYS = 45
const REBUILD_DAYS = 30

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Return the local ISO date string "YYYY-MM-DD" for a given Date instance
 * using the runtime local time zone.
 */
function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${String(y).padStart(4, '0')}-${m}-${d}`
}

/**
 * Return a Date object representing local midnight N days before `origin`
 * (0 = `origin` itself, 1 = yesterday relative to origin, …).
 */
function daysAgo(origin: Date, n: number): Date {
  return new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() - n)
}

/**
 * Build a deterministic showcase mock: ~16 days ending today, no Math.random.
 * Numbers are derived from the day-of-month so they vary plausibly.
 */
function buildShowcaseMock(): Record<string, ProductivityDaily> {
  const today = new Date()
  const record: Record<string, ProductivityDaily> = {}

  const DAYS = 16
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = daysAgo(today, i)
    const isoDate = toLocalIsoDate(date)
    // Derive plausible values from the day-of-month (deterministic, no random)
    const dom = date.getDate()
    const closed = 2 + (dom % 8) // 2–9
    const fullFlow = dom % 5 // 0–4
    const planned = 1 + (dom % 7) // 1–7
    const wip = 6 + (dom % 9) // 6–14
    // weekday: JS getDay() Sunday=0 → Mon=0…Sun=6 (same mapping as aggregateDaily)
    const jsDow = date.getDay()
    const weekday = ((jsDow + 6) % 7) as ProductivityDaily['weekday']

    record[isoDate] = { date: isoDate, closed, fullFlow, planned, wip, weekday }
  }

  return record
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the full cache from storage.
 * In showcase mode returns the deterministic mock record.
 */
export async function getDailyCache(): Promise<Record<string, ProductivityDaily>> {
  if (isShowcaseMode()) {
    return buildShowcaseMock()
  }
  return (await getLocal<Record<string, ProductivityDaily>>(PRODUCTIVITY_DAILY_KEY)) ?? {}
}

/**
 * Persist a single day's snapshot, trimming the cache to at most 45 most-recent
 * entries (by lexical/ISO date order, which equals chronological order).
 * In showcase mode this is a no-op.
 */
export async function setDailyCache(date: string, snapshot: ProductivityDaily): Promise<void> {
  if (isShowcaseMode()) {
    return
  }

  const cache = (await getLocal<Record<string, ProductivityDaily>>(PRODUCTIVITY_DAILY_KEY)) ?? {}
  cache[date] = snapshot

  // Keep only the MAX_CACHE_DAYS most-recent dates.
  const keys = Object.keys(cache).sort() // ISO strings sort lexically == chronologically
  if (keys.length > MAX_CACHE_DAYS) {
    const toRemove = keys.slice(0, keys.length - MAX_CACHE_DAYS)
    for (const k of toRemove) {
      delete cache[k]
    }
  }

  await setLocal(PRODUCTIVITY_DAILY_KEY, cache)
}

/**
 * Recompute all 30 daily snapshots from the task list and overwrite the cache.
 * In showcase mode returns the deterministic mock record without writing.
 */
export async function rebuildDailyCache(
  tasks: TodoTask[],
): Promise<Record<string, ProductivityDaily>> {
  if (isShowcaseMode()) {
    return buildShowcaseMock()
  }

  const today = new Date()
  const record: Record<string, ProductivityDaily> = {}

  for (let i = REBUILD_DAYS - 1; i >= 0; i--) {
    const dayDate = daysAgo(today, i)
    const snapshot = aggregateDaily(tasks, dayDate)
    record[snapshot.date] = snapshot
  }

  await setLocal(PRODUCTIVITY_DAILY_KEY, record)
  return record
}

/**
 * Compute today's snapshot, persist it, and return it.
 * In showcase mode returns today's entry from the mock without writing.
 */
export async function ensureTodayFresh(tasks: TodoTask[]): Promise<ProductivityDaily> {
  if (isShowcaseMode()) {
    const mock = buildShowcaseMock()
    const todayKey = toLocalIsoDate(new Date())
    // Fallback: should always be present, but guard just in case.
    return mock[todayKey] ?? aggregateDaily(tasks, new Date())
  }

  const snapshot = aggregateDaily(tasks, new Date())
  await setDailyCache(snapshot.date, snapshot)
  return snapshot
}
