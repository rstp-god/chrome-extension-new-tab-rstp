import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils.ts'
import { KPI_DOT_CLASS } from '@/widgets/Productivity/components/KpiLight.styles.ts'
import { computeKpi } from '@/widgets/Productivity/lib/kpi.ts'
import type { BaselineStats, ProductivityDaily } from '@/widgets/Productivity/types.ts'
import { TestId } from '@tests/constants/testIds.ts'

interface KpiLightProps {
  today: ProductivityDaily
  baseline: BaselineStats
  coldStart: boolean
  splitWeekdayWeekend: boolean
}

export function KpiLight({ today, baseline, coldStart, splitWeekdayWeekend }: KpiLightProps) {
  const { t } = useTranslation('productivityWidget')
  const status = computeKpi(today, baseline, coldStart, splitWeekdayWeekend)

  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn('h-3 w-3 shrink-0 rounded-full', KPI_DOT_CLASS[status])}
        data-testid={TestId.ProductivityKpiDot}
      />
      <span className="text-sm">{t(`kpi.${status}`)}</span>
    </div>
  )
}
