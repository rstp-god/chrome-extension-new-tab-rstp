import { useTranslation } from 'react-i18next'

import { DEFAULT_CHART_SHADES } from '@/data/chartPalette.ts'
import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx'
import { TabStatsRadialLayout } from '@/widgets/TabStats/components/TabStatsRadialLayout.tsx'
import { TabStatsSparkline } from '@/widgets/TabStats/components/TabStatsSparkline.tsx'
import { PREVIEW_TAB_STATS_DATA } from '@/widgets/TabStats/preview.fixture.ts'

const PREVIEW_VISIBLE_KEYS = ['openNow', 'created', 'closed'] as const

export function TabStatsWidgetPreview() {
  const { t } = useTranslation('tabStatsWidget')
  const primary = DEFAULT_CHART_SHADES[0]

  return (
    <WidgetFrame title={t('title')} pinned={false}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('title')}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('periodTodayLabel')}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <TabStatsRadialLayout
            visibleKeys={PREVIEW_VISIBLE_KEYS}
            data={PREVIEW_TAB_STATS_DATA}
            radialFill={primary}
          />
        </div>

        {PREVIEW_TAB_STATS_DATA.sparkline && (
          <TabStatsSparkline points={PREVIEW_TAB_STATS_DATA.sparkline} stroke={primary} />
        )}
      </div>
    </WidgetFrame>
  )
}
