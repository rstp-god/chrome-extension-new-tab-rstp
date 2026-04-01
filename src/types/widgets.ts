import { ComponentType } from 'react'
import { Layout, LayoutItem } from 'react-grid-layout'

export const WIDGET_LAYOUT_KEY = 'widgets-layout:v1'

export interface WidgetMeta {
  widgetType: string
  title: string
  titleI18nKey?: string
  description?: string
  descriptionI18nKey?: string
  defaultLayout: Pick<LayoutItem, 'w' | 'h'> &
    Partial<Pick<LayoutItem, 'minW' | 'minH' | 'maxW' | 'maxH'>>
}

export interface WidgetModule {
  meta: WidgetMeta
  Component: ComponentType<unknown>
  PreviewComponent?: ComponentType<unknown>
}

const modules = import.meta.glob('../widgets/*/index.ts', { eager: true }) as Record<
  string,
  WidgetModule
>

export const widgetRegistry = Object.fromEntries(
  Object.values(modules).map((m) => [m.meta.widgetType, m]),
) as Record<string, WidgetModule>

export type WidgetType = keyof typeof widgetRegistry

export type WidgetInstance = {
  id: string
  title: string
  layout: LayoutItem
  widgetType: WidgetType
}

export type Widgets = {
  widgets: WidgetInstance[]
  layout: Layout
}

export const DEFAULT_INSTANCES: WidgetInstance[] = [
  {
    id: 'search-1',
    title: 'Search',
    widgetType: 'search',
    layout: { i: 'search-1', x: 0, y: 0, w: 3, h: 4, minW: 3, minH: 4, maxH: 4 },
  },
]
