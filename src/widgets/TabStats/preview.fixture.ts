import type { TabStatsData } from '@/widgets/TabStats/types.ts'

/** Static preview data for the Add-Widget dialog. */
export const PREVIEW_TAB_STATS_DATA: TabStatsData = {
  openNow: 23,
  discardedNow: 6,
  today: {
    created: 47,
    closed: 31,
    peakOpen: 38,
    avgLifetime: 2.4 * 3600,
  },
  deltas: {
    createdDelta: 12,
    closedDelta: -5,
  },
  sparkline: [
    { label: 'Mon', value: 18 },
    { label: 'Tue', value: 24 },
    { label: 'Wed', value: 19 },
    { label: 'Thu', value: 28 },
    { label: 'Fri', value: 31 },
    { label: 'Sat', value: 22 },
    { label: 'Sun', value: 14 },
  ],
  isEmpty: false,
}
