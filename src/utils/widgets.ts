import { WidgetInstance, widgetRegistry, WidgetType } from '@/types/widgets.ts'
import { LayoutItem } from 'react-grid-layout'

const GRID_COLS = 12

function collides(
  first: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>,
  second: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>,
) {
  if (first.x + first.w <= second.x) return false
  if (second.x + second.w <= first.x) return false
  if (first.y + first.h <= second.y) return false
  if (second.y + second.h <= first.y) return false
  return true
}

function findFreePosition(existingLayout: readonly LayoutItem[], width: number, height: number) {
  const maxOccupiedRow = existingLayout.reduce((maxRow, item) => {
    const itemBottomEdge = item.y + item.h
    if (!Number.isFinite(itemBottomEdge)) {
      return maxRow
    }
    return Math.max(maxRow, itemBottomEdge)
  }, 0)

  for (let y = 0; y <= maxOccupiedRow; y += 1) {
    for (let x = 0; x <= GRID_COLS - width; x += 1) {
      const candidate = { x, y, w: width, h: height }
      const hasCollision = existingLayout.some((item) => collides(candidate, item))

      if (!hasCollision) {
        return { x, y }
      }
    }
  }

  return { x: 0, y: Infinity }
}

export function createWidgetInstance(
  widgetType: WidgetType,
  existingLayout: readonly LayoutItem[] = [],
): WidgetInstance {
  const mod = widgetRegistry[widgetType]
  const meta = mod.meta

  const id = `${widgetType}-${crypto.randomUUID()}`
  const position = findFreePosition(existingLayout, meta.defaultLayout.w, meta.defaultLayout.h)

  const layout: LayoutItem = {
    i: id,
    x: position.x,
    y: position.y,
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
