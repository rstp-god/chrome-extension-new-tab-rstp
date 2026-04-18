/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type {
  ActivityAllSnapshot,
  ActivityDaySnapshot,
  ActivityWeekSnapshot,
} from '@/background/activity/types.ts'
import {
  useActivityAllStore,
  useActivityDayStore,
  useActivityWeekStore,
} from '@/store/activity.snapshots.ts'
import { useScreenTimeData } from '@/widgets/ScreenTime/hooks/useScreenTimeData.ts'
import { OTHER_KEY } from '@/widgets/ScreenTime/types.ts'

const EMPTY_TAB_METRICS = { created: 0, closed: 0, peakOpen: 0, avgLifetime: 0 }

const DAY_SNAPSHOT: ActivityDaySnapshot = {
  date: '2026-04-18',
  buckets: [
    {
      key: '09',
      domains: {
        'a.com': { totalTime: 600, visits: 2 },
        'b.com': { totalTime: 120, visits: 1 },
        'c.com': { totalTime: 30, visits: 1 },
      },
      tabs: EMPTY_TAB_METRICS,
    },
    {
      key: '10',
      domains: {
        'a.com': { totalTime: 900, visits: 3 },
        'b.com': { totalTime: 60, visits: 1 },
      },
      tabs: EMPTY_TAB_METRICS,
    },
  ],
  totalsByDomain: {
    'a.com': { totalTime: 1500, visits: 5 },
    'b.com': { totalTime: 180, visits: 2 },
    'c.com': { totalTime: 30, visits: 1 },
  },
}

const WEEK_SNAPSHOT: ActivityWeekSnapshot = {
  weekStart: '2026-04-13',
  buckets: [],
  totalsByDomain: {},
}

const ALL_SNAPSHOT: ActivityAllSnapshot = {
  buckets: [
    {
      key: '2026-04-17',
      domains: { 'x.com': { totalTime: 100, visits: 1 } },
      tabs: EMPTY_TAB_METRICS,
    },
    {
      key: '2026-04-18',
      domains: { 'x.com': { totalTime: 200, visits: 1 } },
      tabs: EMPTY_TAB_METRICS,
    },
  ],
}

function resetStores(): void {
  useActivityDayStore.setState({ snapshot: null })
  useActivityWeekStore.setState({ snapshot: null })
  useActivityAllStore.setState({ snapshot: null })
}

beforeEach(resetStores)
afterEach(resetStores)

describe('useScreenTimeData', () => {
  it('returns empty result when the snapshot is null', () => {
    const { result } = renderHook(() => useScreenTimeData('day', 5))
    expect(result.current.isEmpty).toBe(true)
    expect(result.current.totalSeconds).toBe(0)
    expect(result.current.topDomains).toEqual([])
    expect(result.current.chartRows).toEqual([])
  })

  it('sorts top domains by totalTime desc and assigns colorIndex + slug', () => {
    act(() => useActivityDayStore.setState({ snapshot: DAY_SNAPSHOT }))
    const { result } = renderHook(() => useScreenTimeData('day', 5))
    expect(result.current.topDomains.map((d) => d.domain)).toEqual(['a.com', 'b.com', 'c.com'])
    expect(result.current.topDomains.map((d) => d.slug)).toEqual(['d_a_com', 'd_b_com', 'd_c_com'])
    expect(result.current.topDomains.map((d) => d.colorIndex)).toEqual([0, 1, 2])
    expect(result.current.totalSeconds).toBe(1710)
    expect(result.current.isEmpty).toBe(false)
  })

  it('bundles domains outside top-N into `__other`', () => {
    act(() => useActivityDayStore.setState({ snapshot: DAY_SNAPSHOT }))
    const { result } = renderHook(() => useScreenTimeData('day', 1))
    expect(result.current.topDomains).toHaveLength(1)
    expect(result.current.topDomains[0].domain).toBe('a.com')
    // b.com + c.com => 180 + 30 = 210
    expect(result.current.otherSeconds).toBe(210)
    // Each bucket row should have `__other` column with the non-top sum
    const row09 = result.current.chartRows.find((r) => r.key === '09')
    expect(row09?.[OTHER_KEY]).toBe(150) // b.com(120) + c.com(30)
  })

  it('initialises every top-domain column to 0 in every bucket (for clean stacking)', () => {
    act(() => useActivityDayStore.setState({ snapshot: DAY_SNAPSHOT }))
    const { result } = renderHook(() => useScreenTimeData('day', 5))
    expect(result.current.chartRows).toHaveLength(2)
    // Hour 10 has no c.com activity — column must still exist with value 0.
    const row10 = result.current.chartRows.find((r) => r.key === '10')
    expect(row10).toEqual({
      key: '10',
      d_a_com: 900,
      d_b_com: 60,
      d_c_com: 0,
    })
  })

  it('does not emit __other column when there are no extra domains', () => {
    act(() => useActivityDayStore.setState({ snapshot: DAY_SNAPSHOT }))
    const { result } = renderHook(() => useScreenTimeData('day', 5))
    for (const row of result.current.chartRows) {
      expect(row[OTHER_KEY]).toBeUndefined()
    }
    expect(result.current.otherSeconds).toBe(0)
  })

  it('picks the correct snapshot by period', () => {
    act(() => {
      useActivityDayStore.setState({ snapshot: DAY_SNAPSHOT })
      useActivityWeekStore.setState({ snapshot: WEEK_SNAPSHOT })
      useActivityAllStore.setState({ snapshot: ALL_SNAPSHOT })
    })

    const day = renderHook(() => useScreenTimeData('day', 5)).result.current
    const week = renderHook(() => useScreenTimeData('week', 5)).result.current
    const all = renderHook(() => useScreenTimeData('all', 5)).result.current

    expect(day.totalSeconds).toBe(1710)
    expect(week.totalSeconds).toBe(0)
    // All-snapshot totals are recomputed from its buckets (no precomputed totalsByDomain).
    expect(all.totalSeconds).toBe(300)
    expect(all.topDomains[0].domain).toBe('x.com')
  })
})
