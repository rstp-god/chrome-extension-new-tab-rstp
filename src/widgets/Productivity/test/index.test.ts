import { describe, expect, it } from 'vitest'

import { widgetRegistry } from '@/types/widgets.ts'

describe('Productivity widget registration', () => {
  it('is present in widgetRegistry under the "productivity" key', () => {
    expect(widgetRegistry).toHaveProperty('productivity')
  })

  it('has the correct meta fields', () => {
    const { meta } = widgetRegistry['productivity']!
    expect(meta.widgetType).toBe('productivity')
    expect(meta.titleI18nKey).toBe('productivityWidget:title')
    expect(meta.descriptionI18nKey).toBe('productivityWidget:description')
  })

  it('exports Component and PreviewComponent as functions', () => {
    const widget = widgetRegistry['productivity']!
    expect(widget.Component).toBeTypeOf('function')
    expect(widget.PreviewComponent).toBeTypeOf('function')
  })
})
