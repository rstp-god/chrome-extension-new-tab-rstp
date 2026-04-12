/**
 * Single source of truth for relative-time formatting in the Todo widget
 * (footer sync badge, settings summary, anywhere else that wants
 * "5m ago" / "вчера" without pulling in luxon/dayjs).
 *
 * Built on the platform-native `Intl.RelativeTimeFormat`, so locales come
 * for free and we don't add a runtime dependency. The `numeric: 'auto'`
 * option lets the formatter pick "yesterday" / "вчера" over "1 day ago".
 *
 * Locale defaults to whatever the browser reports; callers can override it
 * (e.g. plumb the i18next current language) if they need lockstep with the
 * widget UI language.
 */

const THRESHOLDS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
]

export function formatRelative(timestamp: number, locale?: string): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const diffMs = timestamp - Date.now()
  const absMs = Math.abs(diffMs)

  for (const { unit, ms } of THRESHOLDS) {
    if (absMs >= ms) {
      const value = Math.round(diffMs / ms)
      return formatter.format(value, unit)
    }
  }

  // < 1 second — collapse to the formatter's "now" string.
  return formatter.format(0, 'second')
}
