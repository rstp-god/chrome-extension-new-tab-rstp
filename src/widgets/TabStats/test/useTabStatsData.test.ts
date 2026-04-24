/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { useTabStatsData } from '@/widgets/TabStats/hooks/useTabStatsData.ts'

// --- Mock chrome.tabs so useOpenTabs doesn't error out -------------------
vi.mock('@/services/chrome/runtime.ts', () => ({
  getChromeObject: () => null, // no chrome in tests → useOpenTabs stays at 0/0
  isShowcaseMode: () => false,
  hasChromeStorageApi: () => false,
  hasChromeStorageEvents: () => false,
}))

// Shape of `TabStatsData.today` — the hook strips `timedCloses`, so this
// only carries the four fields the UI cares about.
const EMPTY_TODAY = { created: 0, closed: 0, peakOpen: 0, avgLifetime: 0 }

// Full `TabMetrics` shape — used for snapshot fixtures.
const EMPTY_METRICS = { ...EMPTY_TODAY, timedCloses: 0 }

const DAY: ActivityDaySnapshot = {
  date: '2026-04-18',
  buckets: [
    {
      key: '10',
      domains: {},
      tabs: { created: 12, closed: 8, peakOpen: 20, avgLifetime: 3600, timedCloses: 8 },
    },
    {
      key: '14',
      domains: {},
      tabs: { created: 5, closed: 3, peakOpen: 22, avgLifetime: 7200, timedCloses: 3 },
    },
  ],
  totalsByDomain: {},
}

const WEEK: ActivityWeekSnapshot = {
  weekStart: '2026-04-13',
  buckets: [
    {
      key: '2026-04-13',
      domains: {},
      tabs: { created: 10, closed: 8, peakOpen: 15, avgLifetime: 1800, timedCloses: 8 },
    },
    {
      key: '2026-04-14',
      domains: {},
      tabs: { created: 12, closed: 10, peakOpen: 18, avgLifetime: 2400, timedCloses: 10 },
    },
  ],
  totalsByDomain: {},
}

const ALL_WITH_YESTERDAY: ActivityAllSnapshot = {
  buckets: [
    {
      key: '2026-04-17',
      domains: {},
      tabs: { created: 10, closed: 5, peakOpen: 14, avgLifetime: 3600, timedCloses: 5 },
    },
    {
      key: '2026-04-18',
      domains: {},
      tabs: { ...EMPTY_METRICS },
    },
  ],
}

function resetStores() {
  useActivityDayStore.setState({ snapshot: null })
  useActivityWeekStore.setState({ snapshot: null })
  useActivityAllStore.setState({ snapshot: null })
}

beforeEach(resetStores)
afterEach(resetStores)

describe('useTabStatsData', () => {
  it('reports empty state when nothing is hydrated', () => {
    const { result } = renderHook(() => useTabStatsData())
    expect(result.current.isEmpty).toBe(true)
    expect(result.current.openNow).toBe(0)
    expect(result.current.today).toEqual(EMPTY_TODAY)
    expect(result.current.sparkline).toBeNull()
  })

  it('collapses day snapshot hourly buckets into today totals', () => {
    act(() => useActivityDayStore.setState({ snapshot: DAY }))
    const { result } = renderHook(() => useTabStatsData())
    expect(result.current.today.created).toBe(17) // 12 + 5
    expect(result.current.today.closed).toBe(11) // 8 + 3
    expect(result.current.today.peakOpen).toBe(22) // max(20, 22)
    // Weighted avg of lifetimes: (3600*8 + 7200*3) / 11 = 4581.8...
    expect(result.current.today.avgLifetime).toBeCloseTo((3600 * 8 + 7200 * 3) / 11, 1)
    expect(result.current.isEmpty).toBe(false)
  })

  it('derives yesterday delta from all-snapshot buckets', () => {
    act(() => {
      useActivityDayStore.setState({ snapshot: DAY })
      useActivityAllStore.setState({ snapshot: ALL_WITH_YESTERDAY })
    })
    const { result } = renderHook(() => useTabStatsData())
    // Created delta: today (17) - yesterday (10) = +7
    expect(result.current.deltas.createdDelta).toBe(7)
    // Closed delta: today (11) - yesterday (5) = +6
    expect(result.current.deltas.closedDelta).toBe(6)
  })

  it('returns null deltas when no yesterday bucket exists', () => {
    act(() => useActivityDayStore.setState({ snapshot: DAY }))
    const { result } = renderHook(() => useTabStatsData())
    expect(result.current.deltas.createdDelta).toBeNull()
    expect(result.current.deltas.closedDelta).toBeNull()
  })

  it('builds sparkline points from week buckets', () => {
    act(() => useActivityWeekStore.setState({ snapshot: WEEK }))
    const { result } = renderHook(() => useTabStatsData())
    expect(result.current.sparkline).toHaveLength(2)
    // Weekday label comes from date-fns format; should not be the raw ISO date.
    expect(result.current.sparkline![0].label).not.toBe('2026-04-13')
    expect(result.current.sparkline![0].value).toBe(15)
    expect(result.current.sparkline![1].value).toBe(18)
  })
})
