import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import type { ChartConfig } from '@/components/ui/chart.tsx'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart.tsx'
import type { DomainTotal, ScreenTimeChartRow } from '@/widgets/ScreenTime/types.ts'
import { OTHER_KEY } from '@/widgets/ScreenTime/types.ts'
import {
  AREA_FILL_OPACITY_DOMAIN,
  AREA_FILL_OPACITY_OTHER,
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

export function ScreenTimeAreaChart({
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
      <AreaChart data={data} margin={CHART_MARGIN}>
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
            cursor={{ stroke: 'var(--muted)' }}
            content={<ChartTooltipContent indicator="dot" />}
          />
        )}
        {topDomains.map((d) => (
          <Area
            key={d.slug}
            dataKey={d.slug}
            stackId="a"
            type="monotone"
            fill={`var(--color-${d.slug})`}
            stroke={`var(--color-${d.slug})`}
            fillOpacity={AREA_FILL_OPACITY_DOMAIN}
          />
        ))}
        {hasOther && (
          <Area
            dataKey={OTHER_KEY}
            stackId="a"
            type="monotone"
            fill={`var(--color-${OTHER_KEY})`}
            stroke={`var(--color-${OTHER_KEY})`}
            fillOpacity={AREA_FILL_OPACITY_OTHER}
          />
        )}
      </AreaChart>
    </ChartContainer>
  )
}
