import { useTranslation } from 'react-i18next'

import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { KpiLight } from '@/widgets/Productivity/components/KpiLight.tsx'
import { ProductivityNumber } from '@/widgets/Productivity/components/ProductivityNumber.tsx'
import { PREVIEW_BASELINE, PREVIEW_TODAY } from '@/widgets/Productivity/preview.fixture.ts'

export function ProductivityWidgetPreview() {
  const { t } = useTranslation('productivityWidget')

  // The preview fixture is a weekday with enough history — never cold-start.
  const coldStart = false
  const comparisonLabel = t('delta.weekdayAverage')

  return (
    <Card className="h-full" data-testid="productivity-widget-preview">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardAction>
          <KpiLight
            today={PREVIEW_TODAY}
            baseline={PREVIEW_BASELINE}
            coldStart={coldStart}
            splitWeekdayWeekend={true}
          />
        </CardAction>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ProductivityNumber
            label={t('metrics.closed')}
            value={PREVIEW_TODAY.closed}
            baseline={PREVIEW_BASELINE.closed.weekdayMedian}
            coldStart={coldStart}
            comparisonLabel={comparisonLabel}
          />
          <ProductivityNumber
            label={t('metrics.fullFlow')}
            value={PREVIEW_TODAY.fullFlow}
            baseline={PREVIEW_BASELINE.fullFlow.weekdayMedian}
            coldStart={coldStart}
            comparisonLabel={comparisonLabel}
          />
          <ProductivityNumber
            label={t('metrics.planned')}
            value={PREVIEW_TODAY.planned}
            baseline={PREVIEW_BASELINE.planned.weekdayMedian}
            coldStart={coldStart}
            comparisonLabel={comparisonLabel}
          />
          <ProductivityNumber
            label={t('metrics.wip')}
            value={PREVIEW_TODAY.wip}
            baseline={PREVIEW_BASELINE.wip.weekdayMedian}
            coldStart={coldStart}
            comparisonLabel={comparisonLabel}
          />
        </div>
      </CardContent>
    </Card>
  )
}
