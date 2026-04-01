import { WidgetMeta } from '@/types/widgets.ts'
import { ChromeLibraryWidget } from '@/widgets/ChromeLibrary/ChromeLibraryWidget.tsx'
import { ChromeLibraryWidgetPreview } from '@/widgets/ChromeLibrary/ChromeLibraryWidgetPreview.tsx'

export const meta = {
  widgetType: 'chromeLibrary',
  title: 'Chrome Library',
  titleI18nKey: 'chromeLibraryWidget:title',
  description: 'Groups and bookmarks from Chrome',
  descriptionI18nKey: 'chromeLibraryWidget:description',
  defaultLayout: { w: 3, h: 8, minW: 3, minH: 8 },
} satisfies WidgetMeta

export const Component = ChromeLibraryWidget
export const PreviewComponent = ChromeLibraryWidgetPreview
