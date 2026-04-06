import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { SearchWidgetPreview } from '@/widgets/Search/SearchWidgetPreview.tsx'

describe('SearchWidgetPreview', () => {
  it('renders preview frame', () => {
    const html = renderToString(<SearchWidgetPreview />)
    expect(html).toContain('title')
  })
})
