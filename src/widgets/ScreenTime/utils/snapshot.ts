import type {
  ActivityAllSnapshot,
  ActivityBucket,
  ActivityDaySnapshot,
  ActivityWeekSnapshot,
  ScreenTimePeriod,
} from '@/background/activity/types.ts'

export interface SnapshotView {
  buckets: ActivityBucket[]
  totalsByDomain: Record<string, { totalTime: number; visits: number }>
}

/**
 * Pick the snapshot that matches the period, with null-safe fallbacks.
 * `all` has no pre-computed `totalsByDomain` in storage — we recompute from
 * buckets on the fly (bounded, ≤ 90 buckets × 500 domains per schema caps).
 */
export function pickSnapshot(
  period: ScreenTimePeriod,
  day: ActivityDaySnapshot | null,
  week: ActivityWeekSnapshot | null,
  all: ActivityAllSnapshot | null,
): SnapshotView {
  if (period === 'day') {
    return {
      buckets: day?.buckets ?? [],
      totalsByDomain: day?.totalsByDomain ?? {},
    }
  }
  if (period === 'week') {
    return {
      buckets: week?.buckets ?? [],
      totalsByDomain: week?.totalsByDomain ?? {},
    }
  }
  const buckets = all?.buckets ?? []
  const totalsByDomain: Record<string, { totalTime: number; visits: number }> = {}
  for (const b of buckets) {
    for (const [domain, usage] of Object.entries(b.domains)) {
      const prev = totalsByDomain[domain]
      if (prev) {
        prev.totalTime += usage.totalTime
        prev.visits += usage.visits
      } else {
        totalsByDomain[domain] = { totalTime: usage.totalTime, visits: usage.visits }
      }
    }
  }
  return { buckets, totalsByDomain }
}
