/**
 * Activity tracking type definitions.
 *
 * Module contents:
 *   - `ActivityEvent` — single raw tab/window event emitted by the tracker.
 *   - `ActivityBucket` — one time bucket (hour or day) in a snapshot.
 *   - `Activity{Day,Week,All}Snapshot` — pre-aggregated reads for widgets.
 *   - `ActivitySettings` — user-owned, chrome.storage-synced preferences.
 *
 * Constants (timing, alarm names, retention limits, storage keys) live in
 * `./constants.ts`. Default values live in `./defaults.ts`. See README.md for
 * the big picture.
 */

export type ActivityEventType =
  | 'tab_activated'
  | 'tab_created'
  | 'tab_closed'
  | 'tab_navigated'
  | 'window_focus'

export interface ActivityEvent {
  timestamp: number
  domain: string
  tabId: number
  eventType: ActivityEventType
  /** ms; set on tab_activated when the tab loses focus (retrospective). */
  duration?: number
  /**
   * Total open-tab count at the moment this event was emitted. Sampled at the
   * dispatch site so `rollup` can update `peakOpen` without reaching into
   * tracker state. Absent on events from older raw logs (pre-peakOpen fix).
   */
  openTabCount?: number
}

export interface DomainUsage {
  /** Seconds spent on this domain within the bucket. */
  totalTime: number
  /** Number of distinct visits (activations/navigations) in the bucket. */
  visits: number
}

export interface TabMetrics {
  created: number
  closed: number
  peakOpen: number
  /** Seconds. */
  avgLifetime: number
  /**
   * Number of closes that carried a `duration` — i.e. tabs whose lifetime we
   * actually measured. Denominator for `avgLifetime` so closes of tabs that
   * predate worker boot (no duration) don't pull the average toward zero.
   */
  timedCloses: number
}

/**
 * A single time bucket within a snapshot.
 * `key` is the hour (`"00".."23"`) for day snapshots,
 * or an ISO date (`"yyyy-MM-dd"`) for week/all snapshots.
 */
export interface ActivityBucket {
  key: string
  domains: Record<string, DomainUsage>
  tabs: TabMetrics
}

export interface ActivityDaySnapshot {
  /** ISO date in the user's local timezone at the time of recording. */
  date: string
  /** Up to 24 hourly buckets (sparse — only hours with activity). */
  buckets: ActivityBucket[]
  /** Precomputed totals across all hours of this day. */
  totalsByDomain: Record<string, DomainUsage>
}

export interface ActivityWeekSnapshot {
  /** Start of the current ISO week (Monday) in the user's local TZ. */
  weekStart: string
  /** Up to 7 daily buckets, oldest → newest. */
  buckets: ActivityBucket[]
  totalsByDomain: Record<string, DomainUsage>
}

export interface ActivityAllSnapshot {
  /** Up to 90 daily buckets, oldest → newest. Totals are computed at read time. */
  buckets: ActivityBucket[]
}

export interface ChartPalette {
  /** Base color picked by the user (HEX). */
  baseHex: string
  /**
   * OKLCH strings derived from `baseHex` via lightness scaling.
   * Length matches `CHART_SHADE_LIGHTNESSES` in `src/data/chartPalette.ts`.
   */
  shades: readonly string[]
}

export const SCREEN_TIME_CHART_TYPES = ['bar', 'area', 'donut'] as const
export type ScreenTimeChartType = (typeof SCREEN_TIME_CHART_TYPES)[number]

export const SCREEN_TIME_PERIODS = ['day', 'week', 'all'] as const
export type ScreenTimePeriod = (typeof SCREEN_TIME_PERIODS)[number]
export interface ScreenTimeSettings {
  chartType: ScreenTimeChartType
  /** User's last-selected period — persisted across sessions. */
  period: ScreenTimePeriod
  showTopDomains: boolean
  showYAxis: boolean
  showGrid: boolean
  showTooltips: boolean
  maxDomains: number
  chartPalette: ChartPalette
}

export interface ActivitySettings {
  paused: boolean
  screenTime: ScreenTimeSettings
}

// Re-exports from constants so existing `from './types'` imports don't break.
// Prefer importing from `./constants` directly in new code.
export {
  ACTIVITY_KEYS,
  ACTIVITY_LIMITS,
  type ActivityStorageKey,
} from '@/background/activity/constants.ts'
