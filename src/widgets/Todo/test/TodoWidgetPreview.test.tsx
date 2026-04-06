import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { TodoWidgetPreview } from '@/widgets/Todo/TodoWidgetPreview.tsx'

describe('TodoWidgetPreview', () => {
  it('renders preview title and add action', () => {
    const html = renderToString(<TodoWidgetPreview />)
    expect(html).toContain('title')
    expect(html).toContain('actions.addTodo')
  })
})
