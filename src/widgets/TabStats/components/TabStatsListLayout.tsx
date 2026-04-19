import { useTranslation } from 'react-i18next'

import type { TabStatsMetricKey } from '@/background/activity/types.ts'
import { Separator } from '@/components/ui/separator.tsx'
import { MetricCell } from '@/widgets/TabStats/components/MetricCell.tsx'
import type { TabStatsData } from '@/widgets/TabStats/types.ts'
import { getMetricDisplay } from '@/widgets/TabStats/utils/metricDisplay.ts'

interface Props {
  visibleKeys: readonly TabStatsMetricKey[]
  data: TabStatsData
}

/** Vertical list of metric rows separated by hairlines. Used for "list" format. */
export function TabStatsListLayout({ visibleKeys, data }: Props) {
  const { t } = useTranslation('tabStatsWidget')
  return (
    <div className="flex flex-col gap-1">
      {visibleKeys.map((key, i) => {
        const m = getMetricDisplay(key, data, t)
        return (
          <div key={key}>
            {i > 0 && <Separator className="my-1" />}
            <MetricCell label={m.label} value={m.value} secondary={m.secondary} variant="row" />
          </div>
        )
      })}
    </div>
  )
}
