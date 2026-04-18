import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import type { ChartConfig } from '@/components/ui/chart.tsx'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart.tsx'
import type { DomainTotal, ScreenTimeChartRow } from '@/widgets/ScreenTime/types.ts'
import { OTHER_KEY } from '@/widgets/ScreenTime/types.ts'
import {
  BAR_RADIUS_NONE,
  BAR_RADIUS_TOP,
  CHART_GRID_DASH,
  CHART_MARGIN,
  CHART_TICK_FONT_SIZE,
  CHART_TICK_MARGIN,
  CHART_Y_AXIS_WIDTH,
  minutesTick,
} from '@/widgets/ScreenTime/utils/chartPresentation.ts'

interface Props {
  data: readonly ScreenTimeChartRow[]
  topDomains: readonly DomainTotal[]
  hasOther: boolean
  config: ChartConfig
  showYAxis: boolean
  showGrid: boolean
  showTooltips: boolean
}

export function ScreenTimeBarChart({
  data,
  topDomains,
  hasOther,
  config,
  showYAxis,
  showGrid,
  showTooltips,
}: Props) {
  return (
    <ChartContainer config={config} className="h-full w-full">
      <BarChart data={data} margin={CHART_MARGIN}>
        {showGrid && <CartesianGrid vertical={false} strokeDasharray={CHART_GRID_DASH} />}
        <XAxis
          dataKey="key"
          tickLine={false}
          axisLine={false}
          tickMargin={CHART_TICK_MARGIN}
          fontSize={CHART_TICK_FONT_SIZE}
        />
        {showYAxis && (
          <YAxis
            tickLine={false}
            axisLine={false}
            width={CHART_Y_AXIS_WIDTH}
            fontSize={CHART_TICK_FONT_SIZE}
            tickFormatter={minutesTick}
          />
        )}
        {showTooltips && (
          <ChartTooltip
            cursor={{ fill: 'var(--muted)' }}
            content={<ChartTooltipContent indicator="dot" />}
          />
        )}
        {topDomains.map((d) => (
          <Bar
            key={d.slug}
            dataKey={d.slug}
            stackId="a"
            fill={`var(--color-${d.slug})`}
            radius={BAR_RADIUS_NONE}
          />
        ))}
        {hasOther && (
          <Bar
            dataKey={OTHER_KEY}
            stackId="a"
            fill={`var(--color-${OTHER_KEY})`}
            radius={BAR_RADIUS_TOP}
          />
        )}
      </BarChart>
    </ChartContainer>
  )
}
