import { useTranslation } from 'react-i18next'

import type { TabStatsMetricKey } from '@/background/activity/types.ts'
import { MetricCell } from '@/widgets/TabStats/components/MetricCell.tsx'
import { TabStatsRadial } from '@/widgets/TabStats/components/TabStatsRadial.tsx'
import type { TabStatsData } from '@/widgets/TabStats/types.ts'
import { activePct, getMetricDisplay } from '@/widgets/TabStats/utils/metricDisplay.ts'

interface Props {
  /** Metric keys to list alongside the radial. `activePct` is implied by the donut and skipped. */
  visibleKeys: readonly TabStatsMetricKey[]
  data: TabStatsData
  /** Radial fill colour — first palette shade by convention. */
  radialFill: string
}

/** Radial chart + stacked metric cells. Used for the "radial" format. */
export function TabStatsRadialLayout({ visibleKeys, data, radialFill }: Props) {
  const { t } = useTranslation('tabStatsWidget')
  const pct = activePct(data)
  const listedKeys = visibleKeys.filter((k) => k !== 'activePct')

  // Edge case: user disabled every metric except activePct — radial is the
  // only thing left to show, so give it the full width.
  if (listedKeys.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-hidden">
        <TabStatsRadial percent={pct} fill={radialFill} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 gap-4 overflow-hidden">
      <div className="flex w-2/5 min-w-0 items-stretch">
        <TabStatsRadial percent={pct} fill={radialFill} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
        {listedKeys.map((key) => {
          const m = getMetricDisplay(key, data, t)
          return (
            <MetricCell
              key={key}
              label={m.label}
              value={m.value}
              secondary={m.secondary}
              variant="row"
            />
          )
        })}
      </div>
    </div>
  )
}
