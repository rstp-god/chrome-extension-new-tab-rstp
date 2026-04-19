import type { TFunction } from 'i18next'

import type { TabStatsMetricKey } from '@/background/activity/types.ts'
import type { TabStatsData } from '@/widgets/TabStats/types.ts'

/** One-hour = 3600s. Helper for the avg-lifetime display. */
const SECONDS_PER_HOUR = 3600

export interface MetricDisplay {
  key: TabStatsMetricKey
  /** Short i18n label ("Open", "Created", …). */
  label: string
  /** Primary number / string ("23", "2.4h", "75%"). */
  value: string
  /** Secondary caption ("of which 17 active", "+12 vs yesterday"), or null. */
  secondary: string | null
}

function formatHours(seconds: number, t: TFunction): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return t('tabStatsWidget:hours', { hours: 0 })
  const hours = seconds / SECONDS_PER_HOUR
  const formatted = hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1)
  return t('tabStatsWidget:hours', { hours: formatted })
}

function formatDelta(delta: number | null, t: TFunction): string | null {
  if (delta === null) return null
  if (delta === 0) return t('tabStatsWidget:deltaFlat')
  const sign = delta > 0 ? '+' : ''
  return t('tabStatsWidget:deltaVsYesterday', { delta: `${sign}${delta}` })
}

export function getMetricDisplay(
  key: TabStatsMetricKey,
  data: TabStatsData,
  t: TFunction,
): MetricDisplay {
  switch (key) {
    case 'openNow': {
      const activeCount = data.openNow - data.discardedNow
      return {
        key,
        label: t('tabStatsWidget:metrics.openNow'),
        value: String(data.openNow),
        secondary:
          data.openNow > 0
            ? t('tabStatsWidget:metricsSecondary.openNowActive', { count: activeCount })
            : null,
      }
    }
    case 'created':
      return {
        key,
        label: t('tabStatsWidget:metrics.created'),
        value: String(data.today.created),
        secondary: formatDelta(data.deltas.createdDelta, t),
      }
    case 'closed':
      return {
        key,
        label: t('tabStatsWidget:metrics.closed'),
        value: String(data.today.closed),
        secondary:
          data.today.avgLifetime > 0
            ? t('tabStatsWidget:metricsSecondary.avgLifetime', {
                lifetime: formatHours(data.today.avgLifetime, t),
              })
            : formatDelta(data.deltas.closedDelta, t),
      }
    case 'avgLifetime':
      return {
        key,
        label: t('tabStatsWidget:metrics.avgLifetime'),
        value: formatHours(data.today.avgLifetime, t),
        secondary: null,
      }
    case 'activePct': {
      const pct =
        data.openNow === 0
          ? 0
          : Math.round(((data.openNow - data.discardedNow) / data.openNow) * 100)
      return {
        key,
        label: t('tabStatsWidget:metrics.activePct'),
        value: `${pct}%`,
        secondary:
          data.openNow > 0
            ? t('tabStatsWidget:metricsSecondary.activeFraction', {
                active: data.openNow - data.discardedNow,
                total: data.openNow,
              })
            : null,
      }
    }
    case 'peakOpen':
      return {
        key,
        label: t('tabStatsWidget:metrics.peakOpen'),
        value: String(data.today.peakOpen),
        secondary: t('tabStatsWidget:metricsSecondary.peakTodayCaption'),
      }
  }
}

/** Percentage used by the radial chart (0..100). */
export function activePct(data: TabStatsData): number {
  if (data.openNow === 0) return 0
  return Math.round(((data.openNow - data.discardedNow) / data.openNow) * 100)
}
