import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'

import type { ScreenTimeChartType } from '@/background/activity/types.ts'
import { ScreenTimeAreaChart } from '@/widgets/ScreenTime/components/ScreenTimeAreaChart.tsx'
import { ScreenTimeBarChart } from '@/widgets/ScreenTime/components/ScreenTimeBarChart.tsx'
import { ScreenTimeDomainList } from '@/widgets/ScreenTime/components/ScreenTimeDomainList.tsx'
import { ScreenTimeDonutChart } from '@/widgets/ScreenTime/components/ScreenTimeDonutChart.tsx'
import { ScreenTimeEmpty } from '@/widgets/ScreenTime/components/ScreenTimeEmpty.tsx'
import { ScreenTimeHeader } from '@/widgets/ScreenTime/components/ScreenTimeHeader.tsx'
import { ScreenTimeSettingsDialog } from '@/widgets/ScreenTime/components/settings/ScreenTimeSettingsDialog.tsx'
import { useScreenTimeData } from '@/widgets/ScreenTime/hooks/useScreenTimeData.ts'
import type { ScreenTimeData } from '@/widgets/ScreenTime/types.ts'
import { buildChartConfig } from '@/widgets/ScreenTime/utils/chartConfig.ts'
import { useActivityStore } from '@/store/activity.ts'

import type { ChartConfig } from '@/components/ui/chart.tsx'

function renderChart(
  type: ScreenTimeChartType,
  data: ScreenTimeData,
  config: ChartConfig,
  hasOther: boolean,
  options: { showYAxis: boolean; showGrid: boolean; showTooltips: boolean },
) {
  const stackedProps = {
    data: data.chartRows,
    topDomains: data.topDomains,
    hasOther,
    config,
    showYAxis: options.showYAxis,
    showGrid: options.showGrid,
    showTooltips: options.showTooltips,
  }
  switch (type) {
    case 'bar':
      return <ScreenTimeBarChart {...stackedProps} />
    case 'area':
      return <ScreenTimeAreaChart {...stackedProps} />
    case 'donut':
      return (
        <ScreenTimeDonutChart
          topDomains={data.topDomains}
          otherSeconds={data.otherSeconds}
          config={config}
          showTooltips={options.showTooltips}
        />
      )
  }
}

export function ScreenTimeWidget() {
  const { t } = useTranslation('screenTimeWidget')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { screenTime, update } = useActivityStore(
    useShallow((s) => ({
      screenTime: s.screenTime,
      update: s.updateScreenTimeSettings,
    })),
  )

  const data = useScreenTimeData(screenTime.period, screenTime.maxDomains)
  const hasOther = data.otherSeconds > 0
  const config = useMemo(
    () =>
      buildChartConfig(data.topDomains, screenTime.chartPalette.shades, t('other'), hasOther),
    [data.topDomains, screenTime.chartPalette.shades, t, hasOther],
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ScreenTimeHeader
        totalSeconds={data.totalSeconds}
        period={screenTime.period}
        onPeriodChange={(period) => update({ period })}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-h-0 flex-1 items-stretch">
        {data.isEmpty ? (
          <div className="h-full w-full">
            <ScreenTimeEmpty />
          </div>
        ) : (
          renderChart(screenTime.chartType, data, config, hasOther, {
            showYAxis: screenTime.showYAxis,
            showGrid: screenTime.showGrid,
            showTooltips: screenTime.showTooltips,
          })
        )}
      </div>

      {!data.isEmpty && screenTime.showTopDomains && (
        <ScreenTimeDomainList
          domains={data.topDomains}
          otherSeconds={data.otherSeconds}
          shades={screenTime.chartPalette.shades}
        />
      )}

      <ScreenTimeSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
