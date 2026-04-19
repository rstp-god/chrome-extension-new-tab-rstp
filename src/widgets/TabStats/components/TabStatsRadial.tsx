import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from 'recharts'
import { useTranslation } from 'react-i18next'

interface Props {
  /** Active-tab percentage, 0..100. */
  percent: number
  /** OKLCH stroke colour (usually the palette's primary shade). */
  fill: string
}

/**
 * Radial donut showing % of "active" (non-discarded) open tabs. Center label
 * reads as "NN% active". Used by the radial layout; the cards/list layouts
 * render the same number as a plain `activePct` metric cell instead.
 */
export function TabStatsRadial({ percent, fill }: Props) {
  const { t } = useTranslation('tabStatsWidget')
  const clamped = Math.max(0, Math.min(100, percent))
  const data = [{ name: 'active', value: clamped, fill }]

  return (
    <div className="relative aspect-square h-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          barSize={10}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={8} background isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold leading-none">{clamped}%</span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {t('metrics.activePct')}
        </span>
      </div>
    </div>
  )
}
