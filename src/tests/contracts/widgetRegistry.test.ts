import { describe, expect, it } from 'vitest'
import { widgetRegistry } from '@/types/widgets.ts'

describe('widget registry contract', () => {
  it('contains unique widget types with required exports', () => {
    const entries = Object.entries(widgetRegistry)
    const keys = entries.map(([key]) => key)

    expect(new Set(keys).size).toBe(keys.length)
    for (const [widgetType, widget] of entries) {
      expect(widgetType).toBe(widget.meta.widgetType)
      expect(widget.Component).toBeTypeOf('function')
    }
  })
})
