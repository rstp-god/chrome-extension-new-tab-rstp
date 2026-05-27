import type { ProductivityDaily } from '@/widgets/Productivity/types.ts'

/**
 * Private helpers backing the `dailyCache` public API. Не экспортируется
 * наружу виджета — публичный фасад живёт в `./dailyCache.ts`.
 */

/** Сколько дней мок-кеша строит шоукейс. */
const SHOWCASE_DAYS = 16
/** ISO-date key pattern — only "YYYY-MM-DD" keys are trusted. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Return the local ISO date string "YYYY-MM-DD" for a given Date instance
 * using the runtime local time zone.
 */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${String(y).padStart(4, '0')}-${m}-${d}`
}

/**
 * Return a Date object representing local midnight N days before `origin`
 * (0 = `origin` itself, 1 = yesterday relative to origin, …).
 */
export function daysAgo(origin: Date, n: number): Date {
  return new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() - n)
}

/**
 * Normalise a raw value read from chrome.storage.local into a safe
 * Record<string, ProductivityDaily>.  If the value is not a plain object,
 * return {}.  Otherwise, strip any key that does not look like an ISO date
 * ("YYYY-MM-DD") so a corrupt or adversarially crafted stored value cannot
 * crash callers or leak unexpected keys into trim logic.
 *
 * Only the key shape is validated here; the numeric fields of each entry are
 * intentionally left unchecked (self-healing via rebuildDailyCache).
 */
export function normalizeStoredCache(raw: unknown): Record<string, ProductivityDaily> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, ProductivityDaily> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (ISO_DATE_RE.test(key)) {
      out[key] = value as ProductivityDaily
    }
  }
  return out
}

/**
 * Build a deterministic showcase mock: ~16 days ending today, no Math.random.
 * Numbers are derived from the day-of-month so they vary plausibly.
 */
export function buildShowcaseMock(): Record<string, ProductivityDaily> {
  const today = new Date()
  const record: Record<string, ProductivityDaily> = {}

  for (let i = SHOWCASE_DAYS - 1; i >= 0; i--) {
    const date = daysAgo(today, i)
    const isoDate = toLocalIsoDate(date)
    // Derive plausible values from the day-of-month (deterministic, no random)
    const dom = date.getDate()
    const closed = 2 + (dom % 8) // 2–9
    const fullFlow = dom % 5 // 0–4
    const planned = 1 + (dom % 7) // 1–7
    const wip = 6 + (dom % 9) // 6–14
    // weekday: JS getDay() Sunday=0 → Mon=0…Sun=6 (same mapping as aggregateDaily)
    const jsDow = date.getDay()
    const weekday = ((jsDow + 6) % 7) as ProductivityDaily['weekday']

    record[isoDate] = { date: isoDate, closed, fullFlow, planned, wip, weekday }
  }

  return record
}
