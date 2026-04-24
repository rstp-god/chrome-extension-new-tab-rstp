import { WidgetMeta } from '@/types/widgets.ts'
import { ScreenTimeWidget } from './ScreenTimeWidget.tsx'
import { ScreenTimeWidgetPreview } from './ScreenTimeWidgetPreview.tsx'

export const meta = {
  widgetType: 'screenTime',
  title: 'Screen Time',
  titleI18nKey: 'screenTimeWidget:title',
  description: 'Time spent per domain, stacked by hour / day / month.',
  descriptionI18nKey: 'screenTimeWidget:description',
  defaultLayout: { w: 4, h: 8, minW: 3, minH: 6 },
} satisfies WidgetMeta

export const Component = ScreenTimeWidget
export const PreviewComponent = ScreenTimeWidgetPreview
