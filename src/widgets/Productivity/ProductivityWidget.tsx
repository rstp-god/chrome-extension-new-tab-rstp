import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { KpiLight } from '@/widgets/Productivity/components/KpiLight.tsx'
import { ProductivityError } from '@/widgets/Productivity/components/ProductivityError.tsx'
import { ProductivityNumber } from '@/widgets/Productivity/components/ProductivityNumber.tsx'
import { ProductivitySettings } from '@/widgets/Productivity/components/ProductivitySettings.tsx'
import { ProductivitySkeleton } from '@/widgets/Productivity/components/ProductivitySkeleton.tsx'
import { startProductivityAutoRefresh } from '@/widgets/Productivity/lib/autoRefresh.ts'
import { useProductivityStore } from '@/widgets/Productivity/store/useProductivityStore.ts'
import type { BaselineStats, MetricBaseline } from '@/widgets/Productivity/types.ts'
import { TestId } from '@tests/constants/testIds.ts'

/** Sat/Sun по нашей нумерации недели (Mon=0…Sun=6). */
const WEEKEND_THRESHOLD = 5
/** Сколько дней истории нужно, чтобы вообще не быть в cold-start. */
const COLD_START_HISTORY_DAYS = 7
/** Сколько дней нужно в режиме split, чтобы счесть отдельную медиану надёжной. */
const COLD_START_BUCKET_DAYS = 3

/** Узкая форма метрики, которой достаточно для рендера одной ячейки. */
type MetricKey = 'closed' | 'fullFlow' | 'planned' | 'wip'
interface MetricDescriptor {
  key: MetricKey
  labelKey: `metrics.${MetricKey}`
  visible: boolean
}

export function ProductivityWidget() {
  const { t } = useTranslation('productivityWidget')

  const {
    today,
    baseline,
    error,
    showWip,
    showFullFlow,
    showPlanned,
    splitWeekdayWeekend,
    refresh,
  } = useProductivityStore(
    useShallow((s) => ({
      today: s.today,
      baseline: s.baseline,
      error: s.error,
      showWip: s.showWip,
      showFullFlow: s.showFullFlow,
      showPlanned: s.showPlanned,
      splitWeekdayWeekend: s.splitWeekdayWeekend,
      refresh: s.refresh,
    })),
  )

  useEffect(() => {
    void refresh()
    // refresh is stable — run on mount, and start the Todo subscription
    return startProductivityAutoRefresh()
  }, [])

  if (error !== null) {
    return <ProductivityError onRetry={() => void refresh()} />
  }

  // Только в момент первичной загрузки — фоновые рефреши скелетон не показывают.
  if (today === null || baseline === null) {
    return <ProductivitySkeleton />
  }

  const isWeekend = today.weekday >= WEEKEND_THRESHOLD
  const coldStart = isColdStart(baseline, isWeekend, splitWeekdayWeekend)
  const comparisonLabel = pickComparisonLabel(t, isWeekend, splitWeekdayWeekend)
  const metrics = buildMetrics({ showFullFlow, showPlanned, showWip })

  return (
    <Card className="h-full" data-testid={TestId.ProductivityWidget}>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardAction>
          <div className="flex items-center gap-1">
            <KpiLight
              today={today}
              baseline={baseline}
              coldStart={coldStart}
              splitWeekdayWeekend={splitWeekdayWeekend}
            />
            <ProductivitySettings />
          </div>
        </CardAction>
      </CardHeader>

      <CardContent>
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          data-testid={TestId.ProductivityMetricsGrid}
        >
          {metrics
            .filter((m) => m.visible)
            .map((m) => (
              <ProductivityNumber
                key={m.key}
                label={t(m.labelKey)}
                value={today[m.key]}
                baseline={pickMetricBaseline(baseline[m.key], isWeekend, splitWeekdayWeekend)}
                coldStart={coldStart}
                comparisonLabel={comparisonLabel}
              />
            ))}
        </div>
      </CardContent>
    </Card>
  )
}

function buildMetrics(flags: {
  showFullFlow: boolean
  showPlanned: boolean
  showWip: boolean
}): MetricDescriptor[] {
  // `closed` — всегда; остальное — по флагам настроек.
  return [
    { key: 'closed', labelKey: 'metrics.closed', visible: true },
    { key: 'fullFlow', labelKey: 'metrics.fullFlow', visible: flags.showFullFlow },
    { key: 'planned', labelKey: 'metrics.planned', visible: flags.showPlanned },
    { key: 'wip', labelKey: 'metrics.wip', visible: flags.showWip },
  ]
}

function pickMetricBaseline(
  metric: MetricBaseline,
  isWeekend: boolean,
  splitWeekdayWeekend: boolean,
): number | null {
  if (splitWeekdayWeekend && isWeekend) return metric.weekendMedian
  return metric.weekdayMedian
}

function pickComparisonLabel(
  t: (key: string) => string,
  isWeekend: boolean,
  splitWeekdayWeekend: boolean,
): string {
  if (!splitWeekdayWeekend) return t('delta.average')
  return isWeekend ? t('delta.weekendAverage') : t('delta.weekdayAverage')
}

function isColdStart(
  baseline: BaselineStats,
  isWeekend: boolean,
  splitWeekdayWeekend: boolean,
): boolean {
  if (baseline.daysOfHistory < COLD_START_HISTORY_DAYS) return true
  if (splitWeekdayWeekend) {
    const bucketDays = isWeekend ? baseline.weekendDays : baseline.weekdayDays
    return bucketDays < COLD_START_BUCKET_DAYS
  }
  return baseline.weekdayDays < COLD_START_BUCKET_DAYS
}
