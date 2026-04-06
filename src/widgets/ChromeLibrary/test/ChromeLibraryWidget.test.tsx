import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const storeState = vi.hoisted(() => ({
  viewMode: 'sectioned' as 'sectioned' | 'combined',
  sectionedMode: 'groups' as 'groups' | 'bookmarks',
  query: '',
  setSectionedMode: vi.fn(),
  setQuery: vi.fn(),
  loading: false,
  errorKey: null as 'apiUnavailable' | 'loadError' | 'openBookmarkError' | 'openTabError' | null,
  groups: [],
  bookmarks: [],
  expandedGroupIds: {},
  expandedFolderIds: {},
  toggleGroupExpanded: vi.fn(),
  openGroup: vi.fn(),
  openGroupTab: vi.fn(),
  toggleFolderExpanded: vi.fn(),
  setViewMode: vi.fn(),
  resetExpandedState: vi.fn(),
  openBookmarkUrl: vi.fn(),
}))

vi.mock('@/widgets/ChromeLibrary/store/store.ts', () => ({
  useChromeLibraryStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}))

import { ChromeLibraryWidget } from '@/widgets/ChromeLibrary/ChromeLibraryWidget.tsx'

describe('ChromeLibraryWidget', () => {
  it('renders search and section switch controls', () => {
    storeState.viewMode = 'sectioned'
    storeState.loading = false
    storeState.errorKey = null

    const html = renderToString(<ChromeLibraryWidget />)
    expect(html).toContain('searchPlaceholder')
    expect(html).toContain('labels.groups')
    expect(html).toContain('labels.bookmarks')
  })

  it('renders loading state', () => {
    storeState.loading = true
    const html = renderToString(<ChromeLibraryWidget />)
    expect(html).toContain('messages.loading')
  })

  it('renders error state', () => {
    storeState.loading = false
    storeState.errorKey = 'loadError'

    const html = renderToString(<ChromeLibraryWidget />)
    expect(html).toContain('messages.loadError')
  })

  it('hides section switch controls in combined mode', () => {
    storeState.loading = false
    storeState.errorKey = null
    storeState.viewMode = 'combined'

    const html = renderToString(<ChromeLibraryWidget />)
    expect(html).not.toContain('grid-cols-2')
  })
})
