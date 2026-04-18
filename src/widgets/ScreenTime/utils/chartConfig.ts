import type { ChartConfig } from '@/components/ui/chart.tsx'
import type { DomainTotal } from '@/widgets/ScreenTime/types.ts'
import { OTHER_KEY } from '@/widgets/ScreenTime/types.ts'

export function buildChartConfig(
  topDomains: readonly DomainTotal[],
  shades: readonly string[],
  otherLabel: string,
  hasOther: boolean,
): ChartConfig {
  const config: ChartConfig = {}
  for (const d of topDomains) {
    config[d.slug] = {
      label: d.domain,
      color: shades[d.colorIndex % shades.length],
    }
  }
  if (hasOther) {
    config[OTHER_KEY] = { label: otherLabel, color: 'oklch(0.65 0 0)' }
  }
  return config
}
