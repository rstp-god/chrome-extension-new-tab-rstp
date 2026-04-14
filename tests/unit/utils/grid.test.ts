import { describe, expect, it } from 'vitest'
import type { LayoutItem } from 'react-grid-layout'
import { rescaleLayout } from '@/utils/grid.ts'

function item(overrides: Partial<LayoutItem>): LayoutItem {
  return { i: 'a', x: 0, y: 0, w: 2, h: 2, ...overrides }
}

describe('rescaleLayout', () => {
  it('returns the layout unchanged when columns match', () => {
    const layout: LayoutItem[] = [item({ i: 'a', x: 3, w: 4 })]
    expect(rescaleLayout(layout, 12, 12)).toEqual(layout)
  })

  it('scales down widths and positions proportionally (12 → 6)', () => {
    const layout: LayoutItem[] = [item({ i: 'a', x: 4, w: 6 })]
    const out = rescaleLayout(layout, 12, 6)
    expect(out[0].x).toBe(2)
    expect(out[0].w).toBe(3)
  })

  it('scales up widths and positions proportionally (12 → 24)', () => {
    const layout: LayoutItem[] = [item({ i: 'a', x: 2, w: 3 })]
    const out = rescaleLayout(layout, 12, 24)
    expect(out[0].x).toBe(4)
    expect(out[0].w).toBe(6)
  })

  it('clamps width to at least 1', () => {
    const layout: LayoutItem[] = [item({ i: 'a', x: 0, w: 1 })]
    const out = rescaleLayout(layout, 24, 6)
    expect(out[0].w).toBeGreaterThanOrEqual(1)
  })

  it('clamps x so rescaled item fits inside the grid', () => {
    const layout: LayoutItem[] = [item({ i: 'a', x: 10, w: 2 })]
    const out = rescaleLayout(layout, 12, 8)
    const { x, w } = out[0]
    expect(x + w).toBeLessThanOrEqual(8)
  })

  it('handles zero/negative columns gracefully', () => {
    const layout: LayoutItem[] = [item({ i: 'a', x: 1, w: 2 })]
    expect(rescaleLayout(layout, 0, 12)).toEqual(layout)
    expect(rescaleLayout(layout, 12, 0)).toEqual(layout)
  })
})
