/**
 * Tests for dailyCache.ts
 *
 * In the Vitest node environment there is no chrome global, so getLocal/setLocal
 * fall back to the module-level in-memory Map inside storage.ts.  That Map
 * persists across tests in the same file, so we reset the cache key in
 * beforeEach via setLocal.
 *
 * Showcase-mode tests use vi.mock to stub isShowcaseMode() → true.  Because the
 * mock must be hoisted before the module under test is imported, and ESM module
 * caches are shared within a file, we use vi.doMock + dynamic import (or
 * vi.mock + vi.importActual) carefully.  See the dedicated describe block.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setLocal } from '@/services/chrome/storage.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'
import { PRODUCTIVITY_DAILY_KEY } from '@/widgets/Productivity/lib/dailyCache.ts'
import {
  getDailyCache,
  setDailyCache,
  rebuildDailyCache,
  ensureTodayFresh,
} from '@/widgets/Productivity/lib/dailyCache.ts'
import type { ProductivityDaily } from '@/widgets/Productivity/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid TodoTask. */
function makeTask(overrides: Partial<TodoTask> & { createdAt: number }): TodoTask {
  return {
    id: crypto.randomUUID(),
    title: 'test',
    description: null,
    status: 'input',
    projectId: null,
    statusChangedAt: overrides.createdAt,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
    ...overrides,
  }
}

function makeSnapshot(date: string, partial: Partial<ProductivityDaily> = {}): ProductivityDaily {
  const d = new Date(date + 'T00:00:00')
  const jsDow = d.getDay()
  const weekday = ((jsDow + 6) % 7) as ProductivityDaily['weekday']
  return {
    date,
    closed: 3,
    fullFlow: 1,
    planned: 4,
    wip: 8,
    weekday,
    ...partial,
  }
}

/** ISO date string for a date N days before today (0 = today). */
function isoDateDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${String(y).padStart(4, '0')}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// Reset storage between tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Clear the cache key so each test starts with an empty store.
  await setLocal(PRODUCTIVITY_DAILY_KEY, {})
})

// ---------------------------------------------------------------------------
// Non-showcase tests (default: extension mode, no chrome global → in-memory Map)
// ---------------------------------------------------------------------------

describe('getDailyCache', () => {
  it('returns {} when the store is empty', async () => {
    const result = await getDailyCache()
    expect(result).toEqual({})
  })

  it('returns the stored record after a write', async () => {
    const isoDate = isoDateDaysAgo(1)
    const snapshot = makeSnapshot(isoDate)
    await setDailyCache(isoDate, snapshot)

    const result = await getDailyCache()
    expect(result[isoDate]).toEqual(snapshot)
  })
})

describe('setDailyCache', () => {
  it('round-trips a single snapshot', async () => {
    const isoDate = isoDateDaysAgo(3)
    const snapshot = makeSnapshot(isoDate, { closed: 7, fullFlow: 2, planned: 5, wip: 11 })

    await setDailyCache(isoDate, snapshot)
    const cache = await getDailyCache()

    expect(cache[isoDate]).toEqual(snapshot)
  })

  it('trims to 45 most-recent entries after exceeding the limit', async () => {
    // Write 50 snapshots with synthetic dates well in the past.
    const baseDate = new Date('2020-01-01')
    for (let i = 0; i < 50; i++) {
      const d = new Date(baseDate)
      d.setDate(d.getDate() + i)
      const iso =
        `${d.getFullYear()}-` +
        `${String(d.getMonth() + 1).padStart(2, '0')}-` +
        `${String(d.getDate()).padStart(2, '0')}`
      await setDailyCache(iso, makeSnapshot(iso))
    }

    const cache = await getDailyCache()
    const keys = Object.keys(cache).sort()

    expect(keys).toHaveLength(45)
    // Must keep the 45 most-recent (latest) dates; the first 5 should be gone.
    const expectedOldest = (() => {
      const d = new Date(baseDate)
      d.setDate(d.getDate() + 5) // index 5 becomes the new oldest
      return (
        `${d.getFullYear()}-` +
        `${String(d.getMonth() + 1).padStart(2, '0')}-` +
        `${String(d.getDate()).padStart(2, '0')}`
      )
    })()
    expect(keys[0]).toBe(expectedOldest)

    const expectedNewest = (() => {
      const d = new Date(baseDate)
      d.setDate(d.getDate() + 49) // index 49 is the last
      return (
        `${d.getFullYear()}-` +
        `${String(d.getMonth() + 1).padStart(2, '0')}-` +
        `${String(d.getDate()).padStart(2, '0')}`
      )
    })()
    expect(keys[44]).toBe(expectedNewest)
  })

  it('does not trim when exactly 45 entries exist', async () => {
    const baseDate = new Date('2021-06-01')
    for (let i = 0; i < 45; i++) {
      const d = new Date(baseDate)
      d.setDate(d.getDate() + i)
      const iso =
        `${d.getFullYear()}-` +
        `${String(d.getMonth() + 1).padStart(2, '0')}-` +
        `${String(d.getDate()).padStart(2, '0')}`
      await setDailyCache(iso, makeSnapshot(iso))
    }

    const cache = await getDailyCache()
    expect(Object.keys(cache)).toHaveLength(45)
  })
})

describe('ensureTodayFresh', () => {
  it("computes today's snapshot and persists it", async () => {
    const tasks: TodoTask[] = []
    const snapshot = await ensureTodayFresh(tasks)

    expect(snapshot.date).toBe(isoDateDaysAgo(0))

    // Confirm it was written to the cache
    const cache = await getDailyCache()
    expect(cache[snapshot.date]).toEqual(snapshot)
  })

  it('snapshot has correct date shape and weekday', async () => {
    const snapshot = await ensureTodayFresh([])
    const today = isoDateDaysAgo(0)

    expect(snapshot.date).toBe(today)
    expect(typeof snapshot.closed).toBe('number')
    expect(typeof snapshot.planned).toBe('number')
    expect(typeof snapshot.wip).toBe('number')
    expect(snapshot.weekday).toBeGreaterThanOrEqual(0)
    expect(snapshot.weekday).toBeLessThanOrEqual(6)
  })

  it("reflects completed tasks in today's snapshot", async () => {
    const now = Date.now()
    const task = makeTask({
      createdAt: now,
      status: 'completed',
      statusChangedAt: now,
      completedAt: now,
    })

    const snapshot = await ensureTodayFresh([task])
    expect(snapshot.closed).toBeGreaterThanOrEqual(1)
    expect(snapshot.planned).toBeGreaterThanOrEqual(1)
  })
})

describe('rebuildDailyCache', () => {
  it('produces exactly 30 day-entries', async () => {
    const result = await rebuildDailyCache([])
    expect(Object.keys(result)).toHaveLength(30)
  })

  it('writes all 30 entries to storage', async () => {
    await rebuildDailyCache([])
    const cache = await getDailyCache()
    expect(Object.keys(cache)).toHaveLength(30)
  })

  it('includes today in the result', async () => {
    const result = await rebuildDailyCache([])
    const today = isoDateDaysAgo(0)
    expect(result[today]).toBeDefined()
    expect(result[today].date).toBe(today)
  })

  it('includes 29 days ago in the result', async () => {
    const result = await rebuildDailyCache([])
    const oldest = isoDateDaysAgo(29)
    expect(result[oldest]).toBeDefined()
  })

  it('does not include 30 days ago (only 30 days ending today)', async () => {
    const result = await rebuildDailyCache([])
    const tooOld = isoDateDaysAgo(30)
    expect(result[tooOld]).toBeUndefined()
  })

  it('overwrites existing cache entries', async () => {
    // Pre-seed a stale value for today
    const today = isoDateDaysAgo(0)
    await setDailyCache(today, makeSnapshot(today, { closed: 999 }))

    await rebuildDailyCache([])
    const cache = await getDailyCache()

    // rebuildDailyCache writes a fresh record; today should have closed=0 (no tasks)
    expect(cache[today]?.closed).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Showcase-mode tests
// ---------------------------------------------------------------------------

describe('showcase mode', () => {
  // We use vi.mock (hoisted) to override runtime.ts for this describe block only.
  // Because vi.mock is hoisted to the top of the file, we use a shared flag
  // pattern: mock runtime.ts to read a variable, then set the variable before
  // each test.
  //
  // However, since the module under test (dailyCache.ts) is already imported
  // above, we need to re-import it with the mock active. The cleanest approach
  // in Vitest is to use a separate vi.mock at the file level that defaults to
  // the real implementation, then use vi.mocked() to reconfigure.

  it('getDailyCache returns non-empty mock in showcase mode', async () => {
    // Use vi.doMock + resetModules to simulate showcase mode in isolation
    vi.resetModules()
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      isShowcaseMode: () => true,
      hasChromeStorageApi: () => false,
      getChromeObject: () => null,
      hasChromeStorageEvents: () => false,
    }))

    const { getDailyCache: getDailyCacheShowcase } =
      await import('@/widgets/Productivity/lib/dailyCache.ts')

    const result = await getDailyCacheShowcase()
    expect(Object.keys(result).length).toBeGreaterThan(0)

    // All entries must be valid ProductivityDaily shapes
    for (const [date, entry] of Object.entries(result)) {
      expect(entry.date).toBe(date)
      expect(typeof entry.closed).toBe('number')
      expect(typeof entry.planned).toBe('number')
      expect(entry.weekday).toBeGreaterThanOrEqual(0)
      expect(entry.weekday).toBeLessThanOrEqual(6)
    }

    vi.doUnmock('@/services/chrome/runtime.ts')
    vi.resetModules()
  })

  it('getDailyCache showcase mock includes today', async () => {
    vi.resetModules()
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      isShowcaseMode: () => true,
      hasChromeStorageApi: () => false,
      getChromeObject: () => null,
      hasChromeStorageEvents: () => false,
    }))

    const { getDailyCache: getDailyCacheShowcase } =
      await import('@/widgets/Productivity/lib/dailyCache.ts')

    const result = await getDailyCacheShowcase()
    const today = isoDateDaysAgo(0)
    expect(result[today]).toBeDefined()

    vi.doUnmock('@/services/chrome/runtime.ts')
    vi.resetModules()
  })

  it('setDailyCache is a no-op in showcase mode', async () => {
    vi.resetModules()
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      isShowcaseMode: () => true,
      hasChromeStorageApi: () => false,
      getChromeObject: () => null,
      hasChromeStorageEvents: () => false,
    }))

    const setLocalMock = vi.fn()
    vi.doMock('@/services/chrome/storage.ts', () => ({
      getLocal: async () => null,
      setLocal: setLocalMock,
    }))

    const { setDailyCache: setDailyCacheShowcase } =
      await import('@/widgets/Productivity/lib/dailyCache.ts')

    await setDailyCacheShowcase('2024-01-01', makeSnapshot('2024-01-01'))
    expect(setLocalMock).not.toHaveBeenCalled()

    vi.doUnmock('@/services/chrome/runtime.ts')
    vi.doUnmock('@/services/chrome/storage.ts')
    vi.resetModules()
  })

  it('ensureTodayFresh returns today entry from mock in showcase mode', async () => {
    vi.resetModules()
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      isShowcaseMode: () => true,
      hasChromeStorageApi: () => false,
      getChromeObject: () => null,
      hasChromeStorageEvents: () => false,
    }))

    const { ensureTodayFresh: ensureTodayFreshShowcase } =
      await import('@/widgets/Productivity/lib/dailyCache.ts')

    const snapshot = await ensureTodayFreshShowcase([])
    const today = isoDateDaysAgo(0)
    expect(snapshot.date).toBe(today)

    vi.doUnmock('@/services/chrome/runtime.ts')
    vi.resetModules()
  })
})
