import type { BaselineStats, ProductivityDaily } from '@/widgets/Productivity/types.ts'

/**
 * Static fixture for the add-dialog preview — a healthy weekday snapshot.
 * No store, no Chrome APIs; data is hardcoded so the preview is instant.
 */

export const PREVIEW_TODAY: ProductivityDaily = {
  date: '2026-05-21',
  closed: 8,
  fullFlow: 3,
  planned: 5,
  wip: 9,
  weekday: 2, // Wednesday
}

export const PREVIEW_BASELINE: BaselineStats = {
  closed: { weekdayMedian: 6, weekendMedian: 2 },
  fullFlow: { weekdayMedian: 2, weekendMedian: 1 },
  planned: { weekdayMedian: 5, weekendMedian: 2 },
  wip: { weekdayMedian: 11, weekendMedian: 4 },
  daysOfHistory: 14,
  weekdayDays: 10,
  weekendDays: 4,
}
