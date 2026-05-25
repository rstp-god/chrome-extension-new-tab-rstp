import type { BaselineStats, MetricBaseline, ProductivityDaily } from '../types.ts'

/**
 * Compute the median of a numeric array.
 *
 * Returns `null` for an empty array. Does not mutate the input.
 * For an even-length array the average of the two middle values is returned
 * (fractional result is fine).
 */
export function median(nums: number[]): number | null {
  if (nums.length === 0) return null

  const sorted = nums.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) {
    return sorted[mid]
  }

  return (sorted[mid - 1] + sorted[mid]) / 2
}

/** Derive the "YYYY-MM-DD" key for a calendar day offset from a base Date. */
function windowDateStrings(asOf: Date, windowDays: number): string[] {
  const y = asOf.getFullYear()
  const m = asOf.getMonth()
  const d = asOf.getDate()

  const result: string[] = []
  for (let i = 1; i <= windowDays; i++) {
    // new Date(year, month, day - i) handles month/year rollovers automatically.
    const day = new Date(y, m, d - i)
    const yy = String(day.getFullYear()).padStart(4, '0')
    const mm = String(day.getMonth() + 1).padStart(2, '0')
    const dd = String(day.getDate()).padStart(2, '0')
    result.push(`${yy}-${mm}-${dd}`)
  }
  return result
}

type MetricKey = 'closed' | 'fullFlow' | 'planned' | 'wip'

/**
 * Compute a 14-day rolling baseline for each productivity metric, split by
 * weekday (Mon–Fri) vs. weekend (Sat–Sun).
 *
 * The window covers `windowDays` local calendar days **strictly before** `asOf`
 * (i.e. asOf-1 through asOf-windowDays). The `asOf` day itself is excluded so
 * a day's in-progress metrics never feed its own baseline.
 *
 * Medians are suppressed to `null` when fewer than 3 days are present in that
 * category (cold-start gate).
 *
 * Pure function — no I/O, no Chrome APIs, no mutation of inputs.
 */
export function computeBaseline(
  cache: Record<string, ProductivityDaily>,
  asOf: Date,
  windowDays = 14,
): BaselineStats {
  const dateStrings = windowDateStrings(asOf, windowDays)

  const weekdayEntries: ProductivityDaily[] = []
  const weekendEntries: ProductivityDaily[] = []

  for (const dateStr of dateStrings) {
    const entry = cache[dateStr]
    if (entry === undefined) continue

    // weekday 0–4 = Mon–Fri; 5–6 = Sat–Sun
    if (entry.weekday <= 4) {
      weekdayEntries.push(entry)
    } else {
      weekendEntries.push(entry)
    }
  }

  const weekdayDays = weekdayEntries.length
  const weekendDays = weekendEntries.length
  const daysOfHistory = weekdayDays + weekendDays

  const buildMetricBaseline = (key: MetricKey): MetricBaseline => {
    const weekdayMedian = weekdayDays >= 3 ? median(weekdayEntries.map((e) => e[key])) : null
    const weekendMedian = weekendDays >= 3 ? median(weekendEntries.map((e) => e[key])) : null
    return { weekdayMedian, weekendMedian }
  }

  return {
    closed: buildMetricBaseline('closed'),
    fullFlow: buildMetricBaseline('fullFlow'),
    planned: buildMetricBaseline('planned'),
    wip: buildMetricBaseline('wip'),
    daysOfHistory,
    weekdayDays,
    weekendDays,
  }
}
