import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { TabStatsFormat, TabStatsMetricKey } from '@/background/activity/types.ts'
import { DEFAULT_CHART_SHADES } from '@/data/chartPalette.ts'
import { useActivityStore } from '@/store/activity.ts'
import { TabStatsCardsLayout } from '@/widgets/TabStats/components/TabStatsCardsLayout.tsx'
import { TabStatsEmpty } from '@/widgets/TabStats/components/TabStatsEmpty.tsx'
import { TabStatsHeader } from '@/widgets/TabStats/components/TabStatsHeader.tsx'
import { TabStatsListLayout } from '@/widgets/TabStats/components/TabStatsListLayout.tsx'
import { TabStatsRadialLayout } from '@/widgets/TabStats/components/TabStatsRadialLayout.tsx'
import { TabStatsSettingsDialog } from '@/widgets/TabStats/components/settings/TabStatsSettingsDialog.tsx'
import { TabStatsSparkline } from '@/widgets/TabStats/components/TabStatsSparkline.tsx'
import { useTabStatsData } from '@/widgets/TabStats/hooks/useTabStatsData.ts'
import type { TabStatsData } from '@/widgets/TabStats/types.ts'

function renderLayout(
  format: TabStatsFormat,
  visibleKeys: readonly TabStatsMetricKey[],
  data: TabStatsData,
  radialFill: string,
) {
  switch (format) {
    case 'cards':
      return <TabStatsCardsLayout visibleKeys={visibleKeys} data={data} />
    case 'list':
      return <TabStatsListLayout visibleKeys={visibleKeys} data={data} />
    case 'radial':
      return (
        <TabStatsRadialLayout
          visibleKeys={visibleKeys}
          data={data}
          radialFill={radialFill}
        />
      )
  }
}

export function TabStatsWidget() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { tabStats } = useActivityStore(useShallow((s) => ({ tabStats: s.tabStats })))
  const data = useTabStatsData()

  const visibleKeys = useMemo<readonly TabStatsMetricKey[]>(
    () =>
      (Object.entries(tabStats.visibleMetrics) as [TabStatsMetricKey, boolean][])
        .filter(([, enabled]) => enabled)
        .map(([key]) => key),
    [tabStats.visibleMetrics],
  )

  // Sparkline + radial use the first palette shade so they pick up the
  // user-chosen base hue. Fallback to the default blue if shades is empty
  // (schema guarantees at least one, but belt-and-suspenders).
  const primaryColor = tabStats.chartPalette.shades[0] ?? DEFAULT_CHART_SHADES[0]

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <TabStatsHeader onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {data.isEmpty ? (
          <TabStatsEmpty />
        ) : (
          renderLayout(tabStats.format, visibleKeys, data, primaryColor)
        )}
      </div>

      {!data.isEmpty && tabStats.showSparkline && data.sparkline && (
        <TabStatsSparkline points={data.sparkline} stroke={primaryColor} />
      )}

      <TabStatsSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
