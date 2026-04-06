import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { SearchWidget } from '@/widgets/Search/SearchWidget.tsx'

describe('SearchWidget', () => {
  it('renders translated controls', () => {
    const html = renderToString(<SearchWidget />)
    expect(html).toContain('placeholder')
    expect(html).toContain('submit')
  })
})
