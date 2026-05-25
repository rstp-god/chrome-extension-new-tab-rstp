import { isShowcaseMode } from '@/services/chrome/runtime.ts'
import { getLocal, setLocal } from '@/services/chrome/storage.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'

import { aggregateDaily } from './aggregateDaily.ts'
import {
  buildShowcaseMock,
  daysAgo,
  normalizeStoredCache,
  toLocalIsoDate,
} from './dailyCache.helpers.ts'
import type { ProductivityDaily } from '../types.ts'

/**
 * Public API of the daily-cache store. Internal helpers live in
 * `./dailyCache.helpers.ts`; this file owns the chrome.storage I/O,
 * the cache-size policy, and the showcase short-circuits.
 */

export const PRODUCTIVITY_DAILY_KEY = 'productivity_daily'

const MAX_CACHE_DAYS = 45
const REBUILD_DAYS = 30

/**
 * Read the full cache from storage.
 * In showcase mode returns the deterministic mock record.
 */
export async function getDailyCache(): Promise<Record<string, ProductivityDaily>> {
  if (isShowcaseMode()) {
    return buildShowcaseMock()
  }
  return normalizeStoredCache(await getLocal<unknown>(PRODUCTIVITY_DAILY_KEY))
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

  const cache = normalizeStoredCache(await getLocal<unknown>(PRODUCTIVITY_DAILY_KEY))
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
