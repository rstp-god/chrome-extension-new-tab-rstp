import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { ChromeLibraryWidgetPreview } from '@/widgets/ChromeLibrary/ChromeLibraryWidgetPreview.tsx'

describe('ChromeLibraryWidgetPreview', () => {
  it('renders preview title', () => {
    const html = renderToString(<ChromeLibraryWidgetPreview />)
    expect(html).toContain('title')
  })
})
