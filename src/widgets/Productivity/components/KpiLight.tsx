import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils.ts'
import type { BaselineStats, ProductivityDaily } from '@/widgets/Productivity/types.ts'

export type KpiStatus = 'green' | 'yellow' | 'red' | 'cold'

export function computeKpi(
  today: ProductivityDaily,
  baseline: BaselineStats,
  coldStart: boolean,
): KpiStatus {
  if (coldStart) return 'cold'
  const isWeekend = today.weekday >= 5 // 5 = Sat, 6 = Sun
  const closedBaseline = isWeekend ? baseline.closed.weekendMedian : baseline.closed.weekdayMedian
  const wipBaseline = isWeekend ? baseline.wip.weekendMedian : baseline.wip.weekdayMedian
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
}

const DOT_COLOR: Record<KpiStatus, string> = {
  green: 'bg-emerald-500 shadow-[0_0_6px_2px_rgb(16_185_129_/_0.4)]',
  yellow: 'bg-amber-500 shadow-[0_0_6px_2px_rgb(245_158_11_/_0.4)]',
  red: 'bg-rose-500 shadow-[0_0_6px_2px_rgb(244_63_94_/_0.4)]',
  cold: 'bg-zinc-400',
}

export function KpiLight({ today, baseline, coldStart }: KpiLightProps) {
  const { t } = useTranslation('productivityWidget')
  const status = computeKpi(today, baseline, coldStart)

  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn('h-3 w-3 shrink-0 rounded-full', DOT_COLOR[status])}
        data-testid="kpi-dot"
      />
      <span className="text-sm">{t(`kpi.${status}`)}</span>
    </div>
  )
}
