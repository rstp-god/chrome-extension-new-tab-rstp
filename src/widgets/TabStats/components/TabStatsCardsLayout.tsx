import { useTranslation } from 'react-i18next'

import type { TabStatsMetricKey } from '@/background/activity/types.ts'
import { MetricCell } from '@/widgets/TabStats/components/MetricCell.tsx'
import type { TabStatsData } from '@/widgets/TabStats/types.ts'
import { getMetricDisplay } from '@/widgets/TabStats/utils/metricDisplay.ts'

interface Props {
  visibleKeys: readonly TabStatsMetricKey[]
  data: TabStatsData
}

/** 2-column grid of metric cards. Used for the "cards" format. */
export function TabStatsCardsLayout({ visibleKeys, data }: Props) {
  const { t } = useTranslation('tabStatsWidget')
  return (
    <div className="grid h-full grid-cols-2 content-start gap-3 overflow-y-auto">
      {visibleKeys.map((key) => {
        const m = getMetricDisplay(key, data, t)
        return (
          <MetricCell
            key={key}
            label={m.label}
            value={m.value}
            secondary={m.secondary}
            variant="card"
          />
        )
      })}
    </div>
  )
}
