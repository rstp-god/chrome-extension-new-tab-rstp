import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { KpiLight } from '@/widgets/Productivity/components/KpiLight.tsx'
import { ProductivityNumber } from '@/widgets/Productivity/components/ProductivityNumber.tsx'
import { ProductivitySettings } from '@/widgets/Productivity/components/ProductivitySettings.tsx'
import { useProductivityStore } from '@/widgets/Productivity/store/useProductivityStore.ts'
import { TestId } from '@tests/constants/testIds.ts'

export function ProductivityWidget() {
  const { t } = useTranslation('productivityWidget')

  const today = useProductivityStore((s) => s.today)
  const baseline = useProductivityStore((s) => s.baseline)
  const error = useProductivityStore((s) => s.error)
  const showWip = useProductivityStore((s) => s.showWip)
  const showFullFlow = useProductivityStore((s) => s.showFullFlow)
  const showPlanned = useProductivityStore((s) => s.showPlanned)
  const splitWeekdayWeekend = useProductivityStore((s) => s.splitWeekdayWeekend)
  const refresh = useProductivityStore((s) => s.refresh)

  useEffect(() => {
    void refresh()
    // refresh is stable — only run on mount
  }, [])

  // ── Error state ────────────────────────────────────────────────────────────
  if (error !== null) {
    return (
      <Card className="h-full" data-testid={TestId.ProductivityWidgetError}>
        <CardContent className="flex flex-col items-center gap-3 pt-6">
          <p className="text-sm text-muted-foreground">{t('error.message')}</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            {t('error.retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Initial loading skeleton ───────────────────────────────────────────────
  // Only show skeleton when we have no data yet (not during background refreshes)
  if (today === null || baseline === null) {
    return (
      <Card className="h-full" data-testid={TestId.ProductivityWidgetSkeleton}>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <CardAction>
            <Skeleton className="h-8 w-24" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Loaded state ───────────────────────────────────────────────────────────
  const isWeekend = today.weekday >= 5

  const coldStart = splitWeekdayWeekend
    ? baseline.daysOfHistory < 7 ||
      (isWeekend ? baseline.weekendDays < 3 : baseline.weekdayDays < 3)
    : baseline.daysOfHistory < 7 || baseline.weekdayDays < 3

  function getMetricBaselineForKey(
    metricKey: 'closed' | 'fullFlow' | 'planned' | 'wip',
  ): number | null {
    if (splitWeekdayWeekend) {
      return isWeekend ? baseline![metricKey].weekendMedian : baseline![metricKey].weekdayMedian
    }
    return baseline![metricKey].weekdayMedian
  }

  const comparisonLabel = splitWeekdayWeekend
    ? isWeekend
      ? t('delta.weekendAverage')
      : t('delta.weekdayAverage')
    : t('delta.average')

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
          <ProductivityNumber
            label={t('metrics.closed')}
            value={today.closed}
            baseline={getMetricBaselineForKey('closed')}
            coldStart={coldStart}
            comparisonLabel={comparisonLabel}
          />

          {showFullFlow && (
            <ProductivityNumber
              label={t('metrics.fullFlow')}
              value={today.fullFlow}
              baseline={getMetricBaselineForKey('fullFlow')}
              coldStart={coldStart}
              comparisonLabel={comparisonLabel}
            />
          )}

          {showPlanned && (
            <ProductivityNumber
              label={t('metrics.planned')}
              value={today.planned}
              baseline={getMetricBaselineForKey('planned')}
              coldStart={coldStart}
              comparisonLabel={comparisonLabel}
            />
          )}

          {showWip && (
            <ProductivityNumber
              label={t('metrics.wip')}
              value={today.wip}
              baseline={getMetricBaselineForKey('wip')}
              coldStart={coldStart}
              comparisonLabel={comparisonLabel}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
