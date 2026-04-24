import type { DomainTotal, ScreenTimeChartRow } from '@/widgets/ScreenTime/types.ts'
import { slugifyDomain } from '@/widgets/ScreenTime/utils/domainSlug.ts'

/**
 * Static preview fixture. Rows are derived from each domain's total * the
 * `HOUR_CURVE` fractions — changing a domain's `totalTime` autoscales every
 * bucket, so the mock stays consistent with any tweak.
 */

export const PREVIEW_DOMAINS: readonly DomainTotal[] = [
  { domain: 'youtube.com', slug: slugifyDomain('youtube.com'), totalTime: 8340, colorIndex: 0 },
  { domain: 'github.com', slug: slugifyDomain('github.com'), totalTime: 5040, colorIndex: 1 },
  { domain: 'chatgpt.com', slug: slugifyDomain('chatgpt.com'), totalTime: 4440, colorIndex: 2 },
  {
    domain: 'stackoverflow.com',
    slug: slugifyDomain('stackoverflow.com'),
    totalTime: 1740,
    colorIndex: 3,
  },
]

export const PREVIEW_TOTAL_SECONDS = PREVIEW_DOMAINS.reduce((acc, d) => acc + d.totalTime, 0)

/** Hour labels shown on the x-axis — matches Figma "Screen Time Day" frame. */
const PREVIEW_HOURS = ['08', '09', '10', '12', '14', '16', '18', '20'] as const
/** Fraction of each domain's total that falls into each hour (sums to ≈ 1). */
const HOUR_CURVE = [0.07, 0.14, 0.22, 0.09, 0.18, 0.16, 0.09, 0.05] as const

export const PREVIEW_ROWS: readonly ScreenTimeChartRow[] = PREVIEW_HOURS.map((hour, i) => {
  const row: ScreenTimeChartRow = { key: hour }
  for (const d of PREVIEW_DOMAINS) {
    row[d.slug] = Math.round(d.totalTime * HOUR_CURVE[i])
  }
  return row
})
