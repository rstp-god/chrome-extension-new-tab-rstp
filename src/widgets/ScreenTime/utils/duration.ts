/**
 * Split a duration (seconds) into hours + minutes for i18n formatting.
 * Callers interpolate via i18next so en/ru get native units ("5h 43m" / "5ч 43мин").
 */
export interface HoursMinutes {
  hours: number
  minutes: number
  /** True when the input was positive but rounded to < 1m — treat as "<1m". */
  subMinute: boolean
}

export function toHoursMinutes(seconds: number): HoursMinutes {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { hours: 0, minutes: 0, subMinute: false }
  }
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes === 0) {
    return { hours: 0, minutes: 0, subMinute: true }
  }
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    subMinute: false,
  }
}
