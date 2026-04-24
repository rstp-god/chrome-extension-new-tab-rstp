export interface SparklinePoint {
  /** Day label (e.g. "Mon", "Tue"). */
  label: string
  /** Peak number of open tabs that day. */
  value: number
}

export interface TabStatsData {
  /** Tabs currently open across all Chrome windows. */
  openNow: number
  /** Currently discarded (unloaded) tab count — used for activePct. */
  discardedNow: number
  /** Today's aggregates collapsed from the day snapshot's hourly buckets. */
  today: {
    created: number
    closed: number
    peakOpen: number
    /** Seconds. */
    avgLifetime: number
  }
  /** Delta vs. yesterday (from the all-snapshot) — `null` when no prior day exists. */
  deltas: {
    createdDelta: number | null
    closedDelta: number | null
  }
  /** Per-day peakOpen for the last 7 days, oldest → newest. `null` when week is unpopulated. */
  sparkline: SparklinePoint[] | null
  /** True when we have literally no data to show (fresh install / paused from day 1). */
  isEmpty: boolean
}
