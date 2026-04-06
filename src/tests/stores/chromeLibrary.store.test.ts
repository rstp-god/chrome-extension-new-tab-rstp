import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openTabGroup: vi.fn(async () => {}),
  focusGroupedTab: vi.fn(async () => {}),
  openBookmark: vi.fn(async () => {}),
}))

vi.mock('@/services/chrome/chromeLibrary.ts', () => ({
  getBookmarkTree: vi.fn(async () => []),
  getTabGroupsWithTabs: vi.fn(async () => []),
  openTabGroup: mocks.openTabGroup,
  focusGroupedTab: mocks.focusGroupedTab,
  openBookmark: mocks.openBookmark,
}))

vi.mock('@/services/chrome/events.ts', () => ({
  CHROME_TAB_EVENTS: [],
  CHROME_TAB_GROUP_EVENTS: [],
  CHROME_BOOKMARK_EVENTS: [],
}))

import { useChromeLibraryStore } from '@/widgets/ChromeLibrary/store/store.ts'

beforeEach(() => {
  useChromeLibraryStore.setState({
    query: '',
    viewMode: 'sectioned',
    sectionedMode: 'groups',
    loading: false,
    errorKey: null,
    groups: [],
    bookmarks: [],
    expandedGroupIds: {},
    expandedFolderIds: {},
  })
})

describe('chrome library store', () => {
  it('sets query and toggles mode', () => {
    useChromeLibraryStore.getState().setQuery('abc')
    useChromeLibraryStore.getState().setViewMode('combined')

    expect(useChromeLibraryStore.getState().query).toBe('abc')
    expect(useChromeLibraryStore.getState().viewMode).toBe('combined')
  })

  it('sets openTabError when open group fails', async () => {
    mocks.openTabGroup.mockRejectedValueOnce(new Error('boom'))
    useChromeLibraryStore.getState().openGroup(1, 1)
    await Promise.resolve()

    expect(useChromeLibraryStore.getState().errorKey).toBe('openTabError')
  })
})
