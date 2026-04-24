import { useTranslation } from 'react-i18next'

import { DEFAULT_CHART_SHADES } from '@/data/chartPalette.ts'
import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx'
import { ScreenTimeBarChart } from '@/widgets/ScreenTime/components/ScreenTimeBarChart.tsx'
import { ScreenTimeDomainList } from '@/widgets/ScreenTime/components/ScreenTimeDomainList.tsx'
import {
  PREVIEW_DOMAINS,
  PREVIEW_ROWS,
  PREVIEW_TOTAL_SECONDS,
} from '@/widgets/ScreenTime/preview.fixture.ts'
import { buildChartConfig } from '@/widgets/ScreenTime/utils/chartConfig.ts'
import { toHoursMinutes } from '@/widgets/ScreenTime/utils/duration.ts'

export function ScreenTimeWidgetPreview() {
  const { t } = useTranslation('screenTimeWidget')
  const { hours, minutes } = toHoursMinutes(PREVIEW_TOTAL_SECONDS)
  const total = t('totalHoursMinutes', { hours, minutes })
  const config = buildChartConfig(PREVIEW_DOMAINS, DEFAULT_CHART_SHADES, t('other'), false)

  return (
    <WidgetFrame title={t('title')} pinned={false}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('title')}
          </span>
          <span className="mt-0.5 text-2xl font-semibold leading-tight">{total}</span>
        </div>

        <div className="flex min-h-0 flex-1 items-stretch">
          <ScreenTimeBarChart
            data={PREVIEW_ROWS}
            topDomains={PREVIEW_DOMAINS}
            hasOther={false}
            config={config}
            showYAxis
            showGrid={false}
            showTooltips={false}
          />
        </div>

        <ScreenTimeDomainList
          domains={PREVIEW_DOMAINS}
          otherSeconds={0}
          shades={DEFAULT_CHART_SHADES}
        />
      </div>
    </WidgetFrame>
  )
}
