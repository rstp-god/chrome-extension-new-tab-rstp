import { describe, expect, it } from 'vitest'

import { computeBaseline, median } from '@/widgets/Productivity/lib/baseline.ts'
import type { ProductivityDaily } from '@/widgets/Productivity/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid ProductivityDaily. The `weekday` field defaults to
 * what JavaScript's local Date arithmetic says for the given `date` string.
 */
function makeDaily(
  date: string,
  partial: Partial<Omit<ProductivityDaily, 'date' | 'weekday'>> & {
    weekday?: ProductivityDaily['weekday']
  } = {},
): ProductivityDaily {
  const [y, m, d] = date.split('-').map(Number)
  const jsDow = new Date(y, m - 1, d).getDay() // 0=Sun…6=Sat
  const weekday = ((jsDow + 6) % 7) as ProductivityDaily['weekday']

  return {
    date,
    closed: 0,
    fullFlow: 0,
    planned: 0,
    wip: 0,
    weekday,
    ...partial,
  }
}

/**
 * Build a cache from an array of daily entries.
 */
function buildCache(entries: ProductivityDaily[]): Record<string, ProductivityDaily> {
  const cache: Record<string, ProductivityDaily> = {}
  for (const entry of entries) {
    cache[entry.date] = entry
  }
  return cache
}

/**
 * asOf: 2024-01-22 (Monday). The 14-day window covers 2024-01-08 … 2024-01-21.
 *   Weekdays (wd 0–4): Jan 08(Mon), 09(Tue), 10(Wed), 11(Thu), 12(Fri),
 *                      Jan 15(Mon), 16(Tue), 17(Wed), 18(Thu), 19(Fri) → 10 days
 *   Weekends (wd 5–6): Jan 13(Sat), 14(Sun), 20(Sat), 21(Sun) → 4 days
 *
 * Day 15 before asOf: Jan 07 — outside the window.
 */
const AS_OF = new Date(2024, 0, 22) // 2024-01-22, local midnight

// ---------------------------------------------------------------------------
// median() unit tests
// ---------------------------------------------------------------------------

describe('median', () => {
  it('empty array → null', () => {
    expect(median([])).toBeNull()
  })

  it('single element → that element', () => {
    expect(median([7])).toBe(7)
  })

  it('odd-length → exact middle element', () => {
    expect(median([1, 3, 5])).toBe(3)
    expect(median([5, 1, 3])).toBe(3) // unsorted input
  })

  it('even-length → average of two middle elements', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([4, 1, 3, 2])).toBe(2.5) // unsorted input
  })

  it('does not mutate the input array', () => {
    const arr = [5, 1, 3]
    const original = [...arr]
    median(arr)
    expect(arr).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// computeBaseline() tests
// ---------------------------------------------------------------------------

describe('computeBaseline', () => {
  // 1. Empty cache
  it('empty cache → all medians null, all counters 0', () => {
    const result = computeBaseline({}, AS_OF)

    expect(result.daysOfHistory).toBe(0)
    expect(result.weekdayDays).toBe(0)
    expect(result.weekendDays).toBe(0)

    for (const key of ['closed', 'fullFlow', 'planned', 'wip'] as const) {
      expect(result[key].weekdayMedian).toBeNull()
      expect(result[key].weekendMedian).toBeNull()
    }
  })

  // 2. Full 14-day window — weekday and weekend medians computed correctly
  it('14-day window → closed weekday/weekend medians are exact', () => {
    // Weekday closed values: [3,3,4,4,4,5,5,5,5,5] → sorted [3,3,4,4,4,5,5,5,5,5]
    // Even length 10 → avg of indices 4,5 = (4+5)/2 = 4.5
    const weekdayDates = [
      { date: '2024-01-08', closed: 3 },
      { date: '2024-01-09', closed: 3 },
      { date: '2024-01-10', closed: 4 },
      { date: '2024-01-11', closed: 4 },
      { date: '2024-01-12', closed: 4 },
      { date: '2024-01-15', closed: 5 },
      { date: '2024-01-16', closed: 5 },
      { date: '2024-01-17', closed: 5 },
      { date: '2024-01-18', closed: 5 },
      { date: '2024-01-19', closed: 5 },
    ]
    // Weekend closed values: [2,2,3,3] → sorted, avg of indices 1,2 = (2+3)/2 = 2.5
    const weekendDates = [
      { date: '2024-01-13', closed: 2 },
      { date: '2024-01-14', closed: 2 },
      { date: '2024-01-20', closed: 3 },
      { date: '2024-01-21', closed: 3 },
    ]

    const entries = [
      ...weekdayDates.map(({ date, closed }) => makeDaily(date, { closed })),
      ...weekendDates.map(({ date, closed }) => makeDaily(date, { closed })),
    ]
    const cache = buildCache(entries)
    const result = computeBaseline(cache, AS_OF)

    expect(result.weekdayDays).toBe(10)
    expect(result.weekendDays).toBe(4)
    expect(result.daysOfHistory).toBe(14)

    expect(result.closed.weekdayMedian).toBe(4.5)
    expect(result.closed.weekendMedian).toBe(2.5)
  })

  // 3. Outlier robustness: median is NOT dragged up by an extreme value
  it('outlier in weekday values does not skew the median', () => {
    // closed values: [3,3,3,4,4,4,4,5,5,25] → sorted → median avg of [4] and [4] = 4
    const weekdayDates = [
      { date: '2024-01-08', closed: 3 },
      { date: '2024-01-09', closed: 3 },
      { date: '2024-01-10', closed: 4 },
      { date: '2024-01-11', closed: 4 },
      { date: '2024-01-12', closed: 4 },
      { date: '2024-01-15', closed: 4 },
      { date: '2024-01-16', closed: 5 },
      { date: '2024-01-17', closed: 5 },
      { date: '2024-01-18', closed: 3 },
      { date: '2024-01-19', closed: 25 }, // outlier
    ]

    const entries = weekdayDates.map(({ date, closed }) => makeDaily(date, { closed }))
    const cache = buildCache(entries)
    const result = computeBaseline(cache, AS_OF)

    // Mean would be ~6.0, but median should be 4
    expect(result.closed.weekdayMedian).toBe(4)
    // No weekend entries
    expect(result.closed.weekendMedian).toBeNull()
  })

  // 4. Only weekdays in window → weekendMedian null
  it('window contains only weekday entries → weekdayMedian populated, weekendMedian null, weekendDays 0', () => {
    const entries = [
      makeDaily('2024-01-08', { closed: 2 }), // Mon
      makeDaily('2024-01-09', { closed: 3 }), // Tue
      makeDaily('2024-01-10', { closed: 4 }), // Wed
      makeDaily('2024-01-11', { closed: 5 }), // Thu
      makeDaily('2024-01-12', { closed: 6 }), // Fri
    ]
    const cache = buildCache(entries)
    const result = computeBaseline(cache, AS_OF)

    expect(result.weekdayDays).toBe(5)
    expect(result.weekendDays).toBe(0)
    expect(result.closed.weekdayMedian).toBe(4) // median of [2,3,4,5,6]
    expect(result.closed.weekendMedian).toBeNull()
  })

  // 5. Fewer than 3 days in a category → medians null even with some data
  it('fewer than 3 entries in a category → that category returns null medians', () => {
    // 2 weekday entries, 2 weekend entries — both below the threshold
    const entries = [
      makeDaily('2024-01-08', { closed: 5 }), // Mon wd=0
      makeDaily('2024-01-09', { closed: 7 }), // Tue wd=1
      makeDaily('2024-01-13', { closed: 10 }), // Sat wd=5
      makeDaily('2024-01-14', { closed: 12 }), // Sun wd=6
    ]
    const cache = buildCache(entries)
    const result = computeBaseline(cache, AS_OF)

    expect(result.weekdayDays).toBe(2)
    expect(result.weekendDays).toBe(2)
    expect(result.closed.weekdayMedian).toBeNull()
    expect(result.closed.weekendMedian).toBeNull()
  })

  it('exactly 3 entries in a category → medians are computed (not null)', () => {
    const entries = [
      makeDaily('2024-01-08', { closed: 2 }), // Mon
      makeDaily('2024-01-09', { closed: 4 }), // Tue
      makeDaily('2024-01-10', { closed: 6 }), // Wed
    ]
    const cache = buildCache(entries)
    const result = computeBaseline(cache, AS_OF)

    expect(result.weekdayDays).toBe(3)
    expect(result.closed.weekdayMedian).toBe(4) // median of [2,4,6]
  })

  // 6. asOf exclusion: entry for asOf's own day must NOT affect baseline
  it('asOf day entry with extreme values does NOT affect baseline', () => {
    const entries = [
      makeDaily('2024-01-08', { closed: 3 }), // Mon — in window
      makeDaily('2024-01-09', { closed: 3 }), // Tue — in window
      makeDaily('2024-01-10', { closed: 3 }), // Wed — in window
      // The asOf day itself with an extreme closed value
      makeDaily('2024-01-22', { closed: 9999 }),
    ]
    const cache = buildCache(entries)
    const result = computeBaseline(cache, AS_OF)

    // Only the 3 window entries should contribute; asOf is excluded
    expect(result.weekdayDays).toBe(3)
    expect(result.closed.weekdayMedian).toBe(3) // median of [3,3,3]
  })

  // 7. Window boundary: day-14 included, day-15 NOT included
  it('day exactly 14 before asOf IS included; day 15 before is NOT', () => {
    // asOf = 2024-01-22
    // asOf-14 = 2024-01-08 (Monday, wd=0) — must be included
    // asOf-15 = 2024-01-07 (Sunday, wd=6) — must be excluded
    const entries = [
      makeDaily('2024-01-08', { closed: 10 }), // asOf-14: included
      makeDaily('2024-01-09', { closed: 10 }), // asOf-13
      makeDaily('2024-01-10', { closed: 10 }), // asOf-12
      makeDaily('2024-01-07', { closed: 999 }), // asOf-15: must be excluded
    ]
    const cache = buildCache(entries)
    const result = computeBaseline(cache, AS_OF)

    // Jan 07 is Sunday (wd=6), so if included it would bump weekendDays
    // Jan 08-10 are all weekdays
    expect(result.weekdayDays).toBe(3)
    expect(result.weekendDays).toBe(0) // Jan 07 excluded
    expect(result.daysOfHistory).toBe(3)

    // Jan 08 (closed=10) IS in the window and contributes
    expect(result.closed.weekdayMedian).toBe(10)
    // No weekend contribution from Jan 07
    expect(result.closed.weekendMedian).toBeNull()
  })

  // 9. All four metrics are wired to their own data (guards against cross-metric copy-paste bugs)
  it('all four metrics are computed independently with distinct medians', () => {
    // Window: 2024-01-08 … 2024-01-21 (asOf = 2024-01-22)
    // Use 5 weekday entries (Mon–Fri of the first week) so cold-start gate passes.
    // Each metric gets a clearly different set of values → distinct medians:
    //   closed    : [1,2,3,4,5]  → median 3
    //   fullFlow  : [10,20,30,40,50] → median 30
    //   planned   : [100,101,102,103,104] → median 102
    //   wip       : [7,14,21,28,35] → median 21
    const weekdayDates = [
      { date: '2024-01-08', closed: 1, fullFlow: 10, planned: 100, wip: 7 },
      { date: '2024-01-09', closed: 2, fullFlow: 20, planned: 101, wip: 14 },
      { date: '2024-01-10', closed: 3, fullFlow: 30, planned: 102, wip: 21 },
      { date: '2024-01-11', closed: 4, fullFlow: 40, planned: 103, wip: 28 },
      { date: '2024-01-12', closed: 5, fullFlow: 50, planned: 104, wip: 35 },
    ]

    const entries = weekdayDates.map(({ date, ...rest }) => makeDaily(date, rest))
    const cache = buildCache(entries)
    const result = computeBaseline(cache, AS_OF)

    expect(result.weekdayDays).toBe(5)
    expect(result.closed.weekdayMedian).toBe(3)
    expect(result.fullFlow.weekdayMedian).toBe(30)
    expect(result.planned.weekdayMedian).toBe(102)
    expect(result.wip.weekdayMedian).toBe(21)

    // All four medians are distinct — if any metric were cross-wired these would collide.
    const medians = [
      result.closed.weekdayMedian,
      result.fullFlow.weekdayMedian,
      result.planned.weekdayMedian,
      result.wip.weekdayMedian,
    ]
    expect(new Set(medians).size).toBe(4)
  })

  // 10. Window crossing a year boundary — entries in late December must be picked up
  it('window spanning a year boundary picks up December entries correctly', () => {
    // asOf = 2024-01-05 (Friday). 14-day window = 2023-12-22 … 2024-01-04.
    const asOf = new Date(2024, 0, 5) // Friday

    // Populate 3 weekday entries that fall inside the window in late December 2023.
    //   2023-12-27 (Wed, wd=2), 2023-12-28 (Thu, wd=3), 2023-12-29 (Fri, wd=4)
    // And one entry just outside the window to make sure it is excluded:
    //   2023-12-21 (Thu) — asOf-15, must NOT be included.
    const entries = [
      makeDaily('2023-12-27', { closed: 5 }),
      makeDaily('2023-12-28', { closed: 7 }),
      makeDaily('2023-12-29', { closed: 9 }),
      makeDaily('2023-12-21', { closed: 999 }), // outside window — excluded
    ]
    const cache = buildCache(entries)
    const result = computeBaseline(cache, asOf)

    // Only the 3 in-window entries should contribute.
    expect(result.weekdayDays).toBe(3)
    expect(result.daysOfHistory).toBe(3)
    // median of [5, 7, 9] = 7
    expect(result.closed.weekdayMedian).toBe(7)
    // The out-of-window entry with value 999 must NOT appear.
    expect(result.closed.weekdayMedian).not.toBe(999)
  })

  // 8. Custom windowDays parameter
  it('windowDays=7 respects a shorter window', () => {
    // asOf=2024-01-22; 7-day window = Jan 15–21
    const entries = [
      makeDaily('2024-01-08', { closed: 999 }), // day 14 — outside 7-day window
      makeDaily('2024-01-15', { closed: 1 }), // day 7 — inside
      makeDaily('2024-01-16', { closed: 2 }), // day 6 — inside
      makeDaily('2024-01-17', { closed: 3 }), // day 5 — inside
      makeDaily('2024-01-18', { closed: 4 }), // day 4 — inside
      makeDaily('2024-01-19', { closed: 5 }), // day 3 — inside
    ]
    const cache = buildCache(entries)
    const result = computeBaseline(cache, AS_OF, 7)

    // Jan 08 is outside the 7-day window
    expect(result.weekdayDays).toBe(5)
    expect(result.daysOfHistory).toBe(5)
    expect(result.closed.weekdayMedian).toBe(3) // median of [1,2,3,4,5]
  })
})
