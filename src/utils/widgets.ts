import { WidgetInstance, widgetRegistry, WidgetType } from '@/types/widgets.ts'
import { LayoutItem } from 'react-grid-layout'

export function createWidgetInstance(widgetType: WidgetType): WidgetInstance {
  const mod = widgetRegistry[widgetType]
  const meta = mod.meta

  const id = `${widgetType}-${crypto.randomUUID()}`

  const layout: LayoutItem = {
    i: id,
    x: 0,
    y: Infinity,
    w: meta.defaultLayout.w,
    h: meta.defaultLayout.h,
    minW: meta.defaultLayout.minW,
    minH: meta.defaultLayout.minH,
    maxW: meta.defaultLayout.maxW,
    maxH: meta.defaultLayout.maxH,
  }

  return {
    id,
    widgetType,
    title: meta.title,
    layout,
  }
}
