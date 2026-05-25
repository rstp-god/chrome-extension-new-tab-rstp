import type { WidgetMeta } from '@/types/widgets.ts'

import { ProductivityWidget } from './ProductivityWidget.tsx'
import { ProductivityWidgetPreview } from './ProductivityWidgetPreview.tsx'

export const meta = {
  widgetType: 'productivity',
  title: 'Productivity',
  titleI18nKey: 'productivityWidget:title',
  description: 'Daily task counters with a personal baseline.',
  descriptionI18nKey: 'productivityWidget:description',
  defaultLayout: { w: 4, h: 6, minW: 3, minH: 4 },
} satisfies WidgetMeta

export const Component = ProductivityWidget
export const PreviewComponent = ProductivityWidgetPreview
