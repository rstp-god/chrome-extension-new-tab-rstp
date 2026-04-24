import { WidgetMeta } from '@/types/widgets.ts'
import { TabStatsWidget } from './TabStatsWidget.tsx'
import { TabStatsWidgetPreview } from './TabStatsWidgetPreview.tsx'

export const meta = {
  widgetType: 'tabStats',
  title: 'Tab Stats',
  titleI18nKey: 'tabStatsWidget:title',
  description: 'Open tabs, creation rate, and average lifetime.',
  descriptionI18nKey: 'tabStatsWidget:description',
  defaultLayout: { w: 4, h: 8, minW: 3, minH: 6 },
} satisfies WidgetMeta

export const Component = TabStatsWidget
export const PreviewComponent = TabStatsWidgetPreview
