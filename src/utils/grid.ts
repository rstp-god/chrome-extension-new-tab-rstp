import type { LayoutItem } from 'react-grid-layout'

/**
 * Rescale grid layout items proportionally when the column count changes.
 * Preserves y/h, rescales x/w by (newCols / oldCols), clamps to [0, newCols].
 */
export function rescaleLayout(
  layout: readonly LayoutItem[],
  oldCols: number,
  newCols: number,
): LayoutItem[] {
  if (oldCols === newCols || oldCols <= 0 || newCols <= 0) return [...layout]
  const ratio = newCols / oldCols

  return layout.map((item) => {
    const newW = Math.max(1, Math.min(newCols, Math.round(item.w * ratio)))
    const maxX = Math.max(0, newCols - newW)
    const newX = Math.max(0, Math.min(maxX, Math.round(item.x * ratio)))

    return {
      ...item,
      x: newX,
      w: newW,
    }
  })
}
