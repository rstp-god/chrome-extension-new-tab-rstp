import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils.ts'
import type { BaselineStats, ProductivityDaily } from '@/widgets/Productivity/types.ts'
import { TestId } from '@tests/constants/testIds.ts'

export type KpiStatus = 'green' | 'yellow' | 'red' | 'cold'

export function computeKpi(
  today: ProductivityDaily,
  baseline: BaselineStats,
  coldStart: boolean,
  splitWeekdayWeekend: boolean,
): KpiStatus {
  if (coldStart) return 'cold'
  const useWeekendMedian = splitWeekdayWeekend && today.weekday >= 5
  const closedBaseline = useWeekendMedian
    ? baseline.closed.weekendMedian
    : baseline.closed.weekdayMedian
  const wipBaseline = useWeekendMedian ? baseline.wip.weekendMedian : baseline.wip.weekdayMedian
  if (closedBaseline === null || wipBaseline === null) return 'cold'
  const goodClosed = today.closed >= closedBaseline
  const goodWip = today.wip <= wipBaseline + 1
  if (goodClosed && goodWip) return 'green'
  if (!goodClosed && !goodWip) return 'red'
  return 'yellow'
}

interface KpiLightProps {
  today: ProductivityDaily
  baseline: BaselineStats
  coldStart: boolean
  splitWeekdayWeekend: boolean
}

const DOT_COLOR: Record<KpiStatus, string> = {
  green: 'bg-emerald-500 shadow-[0_0_6px_2px_rgb(16_185_129_/_0.4)]',
  yellow: 'bg-amber-500 shadow-[0_0_6px_2px_rgb(245_158_11_/_0.4)]',
  red: 'bg-rose-500 shadow-[0_0_6px_2px_rgb(244_63_94_/_0.4)]',
  cold: 'bg-zinc-400',
}

export function KpiLight({ today, baseline, coldStart, splitWeekdayWeekend }: KpiLightProps) {
  const { t } = useTranslation('productivityWidget')
  const status = computeKpi(today, baseline, coldStart, splitWeekdayWeekend)

  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn('h-3 w-3 shrink-0 rounded-full', DOT_COLOR[status])}
        data-testid={TestId.ProductivityKpiDot}
      />
      <span className="text-sm">{t(`kpi.${status}`)}</span>
    </div>
  )
}
