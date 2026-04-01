import { WidgetMeta } from '@/types/widgets.ts'
import { TodoWidget } from './TodoWidget.tsx'
import { TodoWidgetPreview } from './TodoWidgetPreview.tsx'

export const meta = {
  widgetType: 'todo',
  title: 'Todo',
  titleI18nKey: 'todoWidget:title',
  description: 'Your task list',
  descriptionI18nKey: 'todoWidget:description',
  defaultLayout: { w: 4, h: 8, minW: 4, minH: 8 },
} satisfies WidgetMeta

export const Component = TodoWidget
export const PreviewComponent = TodoWidgetPreview
