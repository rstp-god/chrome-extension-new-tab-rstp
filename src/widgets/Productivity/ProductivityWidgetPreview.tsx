import { useTranslation } from 'react-i18next'

import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { KpiLight } from '@/widgets/Productivity/components/KpiLight.tsx'
import { ProductivityNumber } from '@/widgets/Productivity/components/ProductivityNumber.tsx'
import { PREVIEW_BASELINE, PREVIEW_TODAY } from '@/widgets/Productivity/preview.fixture.ts'

/** Превью всегда показывает все четыре метрики. */
const PREVIEW_METRIC_KEYS = ['closed', 'fullFlow', 'planned', 'wip'] as const

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
          {PREVIEW_METRIC_KEYS.map((key) => (
            <ProductivityNumber
              key={key}
              label={t(`metrics.${key}`)}
              value={PREVIEW_TODAY[key]}
              baseline={PREVIEW_BASELINE[key].weekdayMedian}
              coldStart={coldStart}
              comparisonLabel={comparisonLabel}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
