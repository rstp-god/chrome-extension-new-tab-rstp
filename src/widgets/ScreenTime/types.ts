/**
 * Widget-local types. The shared activity types (`ScreenTimePeriod`,
 * `ScreenTimeChartType`, …) live in `@/background/activity/types.ts`; this
 * file holds shapes that only exist inside the widget (hook output, chart
 * rows, per-domain totals with a render-time slug + color index).
 */

export interface DomainTotal {
  /** Hostname for display (e.g. `github.com`). */
  domain: string
  /** CSS-ident-safe key used for `--color-<slug>` + recharts `dataKey`. */
  slug: string
  /** Seconds. */
  totalTime: number
  /** 0-based index into `chartPalette.shades`, with modulo wrap. */
  colorIndex: number
}

/**
 * Row for a stacked chart. Every top-domain + optional `__other` column is
 * initialised to 0 so stacked math draws a clean zero baseline. `key` is
 * the x-axis label (hour for day, ISO date for week/all); all other fields
 * are numeric domain totals in seconds.
 */
export type ScreenTimeChartRow = Record<string, number | string> & { key: string }

export interface ScreenTimeData {
  /** Total seconds across the selected period. */
  totalSeconds: number
  /** Top-N domains (sorted desc by time). Length ≤ `maxDomains`. */
  topDomains: DomainTotal[]
  /** Total time for domains outside the top-N, in seconds. */
  otherSeconds: number
  /** recharts-ready rows — one per bucket, one column per top domain + optional `__other`. */
  chartRows: ScreenTimeChartRow[]
  /** True when no buckets have any recorded time. */
  isEmpty: boolean
}

/** CSS-ident-safe sentinel column key for the aggregated "other domains" slice. */
export const OTHER_KEY = '__other'
