import { format } from 'date-fns'
import { useMemo } from 'react'

import { collapseDayToBucket } from '@/background/activity/rollup.ts'
import {
  useActivityAllStore,
  useActivityDayStore,
  useActivityWeekStore,
} from '@/store/activity.snapshots.ts'
import type { SparklinePoint, TabStatsData } from '@/widgets/TabStats/types.ts'

import { useOpenTabs } from '@/widgets/TabStats/hooks/useOpenTabs.ts'

/**
 * Merges live chrome.tabs counts + day/week/all snapshots into the shape
 * consumed by the three Tab Stats layouts. Pure-ish: the chrome.tabs side
 * re-renders via `useOpenTabs` subscriptions, the rest via zustand.
 */
export function useTabStatsData(): TabStatsData {
  const { total: openNow, discarded: discardedNow } = useOpenTabs()
  const day = useActivityDayStore((s) => s.snapshot)
  const week = useActivityWeekStore((s) => s.snapshot)
  const all = useActivityAllStore((s) => s.snapshot)

  return useMemo(() => {
    const collapsedToday = day ? collapseDayToBucket(day) : null
    const today = collapsedToday
      ? {
          created: collapsedToday.tabs.created,
          closed: collapsedToday.tabs.closed,
          peakOpen: collapsedToday.tabs.peakOpen,
          avgLifetime: collapsedToday.tabs.avgLifetime,
        }
      : { created: 0, closed: 0, peakOpen: 0, avgLifetime: 0 }

    // Yesterday = the most-recent `all` bucket that isn't today. If the last
    // bucket's key matches `day.date`, we skip it and read the one before.
    const yesterdayBucket = findYesterdayBucket(all, day?.date)

    const deltas = {
      createdDelta: yesterdayBucket ? today.created - yesterdayBucket.tabs.created : null,
      closedDelta: yesterdayBucket ? today.closed - yesterdayBucket.tabs.closed : null,
    }

    const sparkline: SparklinePoint[] | null =
      week && week.buckets.length > 0
        ? week.buckets.map((b) => ({
            label: safeDayLabel(b.key),
            value: b.tabs.peakOpen,
          }))
        : null

    const isEmpty =
      openNow === 0 &&
      today.created === 0 &&
      today.closed === 0 &&
      (sparkline === null || sparkline.every((p) => p.value === 0))

    return {
      openNow,
      discardedNow,
      today,
      deltas,
      sparkline,
      isEmpty,
    }
  }, [openNow, discardedNow, day, week, all])
}

/**
 * Pick the `all`-snapshot bucket that represents yesterday. If the most recent
 * bucket matches `todayKey`, walk back one. Returns null when there's no
 * prior day on record.
 */
function findYesterdayBucket(
  all: { buckets: { key: string; tabs: { created: number; closed: number } }[] } | null,
  todayKey: string | undefined,
) {
  if (!all || all.buckets.length === 0) return null
  const last = all.buckets[all.buckets.length - 1]
  if (todayKey !== undefined && last.key === todayKey) {
    return all.buckets.length >= 2 ? all.buckets[all.buckets.length - 2] : null
  }
  return last
}

/** Parse an ISO `yyyy-MM-dd` date key into a short weekday label (`Mon`). */
function safeDayLabel(isoDate: string): string {
  try {
    return format(new Date(`${isoDate}T00:00:00`), 'EEE')
  } catch {
    return isoDate
  }
}
