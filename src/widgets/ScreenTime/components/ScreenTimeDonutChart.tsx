import { Pie, PieChart } from 'recharts'

import type { ChartConfig } from '@/components/ui/chart.tsx'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart.tsx'
import type { DomainTotal } from '@/widgets/ScreenTime/types.ts'
import { OTHER_KEY } from '@/widgets/ScreenTime/types.ts'
import {
  DONUT_INNER_RADIUS,
  DONUT_OUTER_RADIUS,
  DONUT_STROKE_WIDTH,
} from '@/widgets/ScreenTime/utils/chartPresentation.ts'

interface Props {
  topDomains: readonly DomainTotal[]
  otherSeconds: number
  config: ChartConfig
  showTooltips: boolean
}

export function ScreenTimeDonutChart({ topDomains, otherSeconds, config, showTooltips }: Props) {
  const data = [
    ...topDomains.map((d) => ({
      name: d.slug,
      value: d.totalTime,
      fill: `var(--color-${d.slug})`,
    })),
    ...(otherSeconds > 0
      ? [{ name: OTHER_KEY, value: otherSeconds, fill: `var(--color-${OTHER_KEY})` }]
      : []),
  ]

  return (
    <ChartContainer config={config} className="aspect-square h-full">
      <PieChart>
        {showTooltips && <ChartTooltip content={<ChartTooltipContent hideLabel />} />}
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={DONUT_INNER_RADIUS}
          outerRadius={DONUT_OUTER_RADIUS}
          strokeWidth={DONUT_STROKE_WIDTH}
        />
      </PieChart>
    </ChartContainer>
  )
}
