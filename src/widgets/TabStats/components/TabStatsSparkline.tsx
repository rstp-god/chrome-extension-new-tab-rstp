import { Line, LineChart, ResponsiveContainer, XAxis } from 'recharts'
import { useTranslation } from 'react-i18next'

import type { SparklinePoint } from '@/widgets/TabStats/types.ts'

const TICK_FONT_SIZE = 10

interface Props {
  points: SparklinePoint[]
  /** OKLCH stroke colour (usually `chartPalette.shades[1]` or `[2]`). */
  stroke: string
}

/**
 * Weekly peak-open sparkline for the Tab Stats widget footer. Day labels on
 * the x-axis, no axes / grid / tooltip — it's a glanceable trend, not an
 * explorable chart.
 */
export function TabStatsSparkline({ points, stroke }: Props) {
  const { t } = useTranslation('tabStatsWidget')
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {t('sparklineCaption')}
      </span>
      <div className="h-10 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              fontSize={TICK_FONT_SIZE}
              interval={0}
            />
            <Line
              dataKey="value"
              type="monotone"
              stroke={stroke}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
