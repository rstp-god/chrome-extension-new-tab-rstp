import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivityEvent } from '@/background/activity/types.ts'
import {
  applyEventToDay,
  collapseDayToBucket,
  dateKey,
  emptyAll,
  emptyDay,
  emptyWeek,
  ensureRolloverForEvent,
  hourKey,
  rebuildFromRaw,
  rolloverDay,
  weekStartKey,
} from '@/background/activity/rollup.ts'

/**
 * All timestamps are pinned to a deterministic local TZ via `vi.setSystemTime`
 * so we don't depend on the test runner's wall clock.
 * Reference date: Thursday 2026-04-16 10:00 local time.
 */
const REF = new Date('2026-04-16T10:00:00').getTime()
const HOUR = 3_600_000
const DAY = 86_400_000

function mkEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    timestamp: REF,
    domain: 'example.com',
    tabId: 1,
    eventType: 'tab_activated',
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(REF)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rollup key helpers', () => {
  it('hourKey returns two-digit hour in local TZ', () => {
    expect(hourKey(REF)).toBe('10')
    expect(hourKey(new Date('2026-04-16T03:15:00').getTime())).toBe('03')
    expect(hourKey(new Date('2026-04-16T23:59:59').getTime())).toBe('23')
  })

  it('dateKey formats as yyyy-MM-dd in local TZ', () => {
    expect(dateKey(REF)).toBe('2026-04-16')
  })

  it('weekStartKey returns Monday of the week', () => {
    // 2026-04-16 is Thursday → Monday is 2026-04-13.
    expect(weekStartKey(REF)).toBe('2026-04-13')
  })
})

describe('applyEventToDay', () => {
  it('adds duration to correct hour bucket and domain totals', () => {
    const day = emptyDay(REF)
    applyEventToDay(
      day,
      mkEvent({ timestamp: REF, domain: 'youtube.com', duration: 5 * 60 * 1000 }),
    )

    expect(day.buckets).toHaveLength(1)
    expect(day.buckets[0].key).toBe('10')
    expect(day.buckets[0].domains['youtube.com']).toEqual({ totalTime: 300, visits: 1 })
    expect(day.totalsByDomain['youtube.com']).toEqual({ totalTime: 300, visits: 1 })
  })

  it('keeps buckets sorted by key', () => {
    const day = emptyDay(REF)
    applyEventToDay(day, mkEvent({ timestamp: REF + 2 * HOUR, duration: 60_000 }))
    applyEventToDay(day, mkEvent({ timestamp: REF - 2 * HOUR, duration: 60_000 }))
    applyEventToDay(day, mkEvent({ timestamp: REF, duration: 60_000 }))
    expect(day.buckets.map((b) => b.key)).toEqual(['08', '10', '12'])
  })

  it('ignores duration-less activation events (just a state marker)', () => {
    const day = emptyDay(REF)
    applyEventToDay(day, mkEvent({ domain: 'example.com' }))
    // No duration → no usage accumulated, no bucket created.
    expect(day.buckets).toHaveLength(0)
    expect(day.totalsByDomain).toEqual({})
  })

  it('tab_created increments counter without touching domain usage', () => {
    const day = emptyDay(REF)
    applyEventToDay(day, mkEvent({ eventType: 'tab_created' }))
    expect(day.buckets[0].tabs.created).toBe(1)
    expect(day.totalsByDomain).toEqual({})
  })

  it('tab_closed updates running avgLifetime', () => {
    const day = emptyDay(REF)
    applyEventToDay(day, mkEvent({ eventType: 'tab_closed', duration: 60_000 })) // 60s
    applyEventToDay(day, mkEvent({ eventType: 'tab_closed', duration: 120_000 })) // 120s
    expect(day.buckets[0].tabs.closed).toBe(2)
    expect(day.buckets[0].tabs.avgLifetime).toBe(90) // (60 + 120) / 2
  })

  it('accumulates domain totals across multiple events', () => {
    const day = emptyDay(REF)
    applyEventToDay(day, mkEvent({ domain: 'a.com', duration: 60_000 }))
    applyEventToDay(day, mkEvent({ domain: 'a.com', duration: 30_000 }))
    applyEventToDay(day, mkEvent({ domain: 'b.com', duration: 45_000 }))
    expect(day.totalsByDomain).toEqual({
      'a.com': { totalTime: 90, visits: 2 },
      'b.com': { totalTime: 45, visits: 1 },
    })
  })
})

describe('collapseDayToBucket', () => {
  it('sums domain time across hourly buckets and preserves tab metrics', () => {
    const day = emptyDay(REF)
    applyEventToDay(day, mkEvent({ timestamp: REF, domain: 'a.com', duration: 60_000 }))
    applyEventToDay(day, mkEvent({ timestamp: REF + HOUR, domain: 'a.com', duration: 30_000 }))
    applyEventToDay(day, mkEvent({ eventType: 'tab_created' }))
    applyEventToDay(day, mkEvent({ eventType: 'tab_closed', duration: 120_000 }))

    const bucket = collapseDayToBucket(day)
    expect(bucket.key).toBe('2026-04-16')
    expect(bucket.domains['a.com']).toEqual({ totalTime: 90, visits: 2 })
    expect(bucket.tabs.created).toBe(1)
    expect(bucket.tabs.closed).toBe(1)
    expect(bucket.tabs.avgLifetime).toBe(120)
  })
})

describe('rolloverDay', () => {
  it('pushes collapsed day into week and all, resets day', () => {
    let day = emptyDay(REF)
    applyEventToDay(day, mkEvent({ domain: 'a.com', duration: 60_000 }))
    const week = emptyWeek(REF)
    const all = emptyAll()

    const tomorrow = REF + DAY
    const result = rolloverDay(day, week, all, tomorrow)

    expect(result.day.date).toBe(dateKey(tomorrow))
    expect(result.day.buckets).toEqual([])
    expect(result.week.buckets).toHaveLength(1)
    expect(result.week.buckets[0].key).toBe('2026-04-16')
    expect(result.week.totalsByDomain['a.com']).toEqual({ totalTime: 60, visits: 1 })
    expect(result.all.buckets).toHaveLength(1)

    // Re-assignment to silence unused-var warning when extending tests below.
    day = result.day
    expect(day.date).toBe(dateKey(tomorrow))
  })

  it('caps week buckets at 7 and drops oldest', () => {
    let day = emptyDay(REF - 7 * DAY)
    let week = emptyWeek(REF - 7 * DAY)
    let all = emptyAll()

    // Simulate 8 consecutive day rollovers.
    for (let i = 0; i < 8; i++) {
      const dayTs = REF - (7 - i) * DAY
      applyEventToDay(day, mkEvent({ timestamp: dayTs, domain: `day${i}.com`, duration: 60_000 }))
      const next = rolloverDay(day, week, all, dayTs + DAY)
      day = next.day
      week = next.week
      all = next.all
    }

    expect(week.buckets.length).toBeLessThanOrEqual(7)
    // Oldest should have been evicted.
    expect(week.buckets.find((b) => b.key === dateKey(REF - 7 * DAY))).toBeUndefined()
  })

  it('resets week when rollover lands in a new ISO week', () => {
    // REF is Thursday 2026-04-16 → week starts 2026-04-13.
    // Jump forward to the next Monday 2026-04-20 → new week.
    const day = emptyDay(REF)
    applyEventToDay(day, mkEvent({ domain: 'a.com', duration: 60_000 }))
    const week = emptyWeek(REF)
    const all = emptyAll()

    const nextMonday = new Date('2026-04-20T00:00:00').getTime()
    const result = rolloverDay(day, week, all, nextMonday)

    expect(result.week.weekStart).toBe('2026-04-20')
    // Only the freshly collapsed day is in the new week.
    expect(result.week.buckets).toHaveLength(1)
    expect(result.week.buckets[0].key).toBe('2026-04-16')
  })
})

describe('ensureRolloverForEvent', () => {
  it('is a no-op when the day is still current', () => {
    const day = emptyDay(REF)
    const week = emptyWeek(REF)
    const all = emptyAll()
    const result = ensureRolloverForEvent(day, week, all, REF + HOUR)
    expect(result.rolledOver).toBe(false)
    expect(result.day).toBe(day)
  })

  it('performs a rollover when the day changed', () => {
    const day = emptyDay(REF)
    applyEventToDay(day, mkEvent({ duration: 60_000 }))
    const week = emptyWeek(REF)
    const all = emptyAll()

    const result = ensureRolloverForEvent(day, week, all, REF + DAY)
    expect(result.rolledOver).toBe(true)
    expect(result.day.date).toBe(dateKey(REF + DAY))
    expect(result.week.buckets).toHaveLength(1)
  })
})

describe('rebuildFromRaw', () => {
  it('reconstructs snapshots from a chronological event log spanning multiple days', () => {
    const events: ActivityEvent[] = [
      mkEvent({ timestamp: REF - DAY, domain: 'a.com', duration: 60_000 }),
      mkEvent({ timestamp: REF - DAY + HOUR, domain: 'b.com', duration: 120_000 }),
      mkEvent({ timestamp: REF, domain: 'a.com', duration: 30_000 }),
    ]

    const { day, week, all } = rebuildFromRaw(events, REF)

    expect(day.date).toBe('2026-04-16')
    expect(day.totalsByDomain['a.com']).toEqual({ totalTime: 30, visits: 1 })

    // Yesterday should be in week + all.
    expect(week.buckets.some((b) => b.key === '2026-04-15')).toBe(true)
    expect(all.buckets.some((b) => b.key === '2026-04-15')).toBe(true)
  })

  it('returns empty snapshots anchored at `now` for an empty event log', () => {
    const { day, week, all } = rebuildFromRaw([], REF)
    expect(day.date).toBe('2026-04-16')
    expect(day.buckets).toEqual([])
    expect(week.buckets).toEqual([])
    expect(all.buckets).toEqual([])
  })

  it('rolls over when the last event is older than today', () => {
    const events: ActivityEvent[] = [
      mkEvent({ timestamp: REF - 2 * DAY, domain: 'a.com', duration: 60_000 }),
    ]
    const { day, week } = rebuildFromRaw(events, REF)
    expect(day.date).toBe('2026-04-16')
    expect(day.buckets).toEqual([])
    expect(week.buckets).toHaveLength(1)
    expect(week.buckets[0].key).toBe('2026-04-14')
  })
})
