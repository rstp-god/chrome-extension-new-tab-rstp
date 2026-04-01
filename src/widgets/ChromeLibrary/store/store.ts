import { ChromeSyncActions, withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import {
  getBookmarkTree,
  focusGroupedTab,
  getTabGroupsWithTabs,
  isChromeLibraryApiAvailable,
  openBookmark,
  openTabGroup,
} from '@/services/chrome/chromeLibrary.ts'
import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import {
  BookmarkTreeItem,
  ChromeLibraryViewMode,
  ChromeTabGroupView,
} from '@/widgets/ChromeLibrary/types/types.ts'
import { z } from 'zod'
import { create } from 'zustand/react'

export const CHROME_LIBRARY_WIDGET_STORAGE_KEY = 'chrome-library-widget:v1'

const chromeLibraryPersistedStateSchema = z.object({
  viewMode: z.union([z.literal('sectioned'), z.literal('combined')]),
})

const chromeLibraryEnvelopeSchema = makeEnvelopeSchema(chromeLibraryPersistedStateSchema)

type ChromeLibraryPersistedState = z.infer<typeof chromeLibraryPersistedStateSchema>
const REFRESH_INTERVAL_MS = 15000

interface ChromeLibraryWidgetState {
  viewMode: ChromeLibraryViewMode
  sectionedMode: 'groups' | 'bookmarks'
  query: string
  loading: boolean
  errorKey: 'apiUnavailable' | 'loadError' | 'openBookmarkError' | 'openTabError' | null
  groups: ChromeTabGroupView[]
  bookmarks: BookmarkTreeItem[]
  expandedGroupIds: Record<number, boolean>
  expandedFolderIds: Record<string, boolean>
  setViewMode: (nextMode: ChromeLibraryViewMode) => void
  setSectionedMode: (nextMode: 'groups' | 'bookmarks') => void
  setQuery: (nextQuery: string) => void
  refreshData: () => void
  toggleGroupExpanded: (groupId: number) => void
  openGroup: (groupId: number, windowId: number) => void
  openGroupTab: (tabId: number, windowId: number) => void
  openBookmarkUrl: (url: string) => void
  toggleFolderExpanded: (folderId: string) => void
  resetExpandedState: () => void
}

export const useChromeLibraryStore = create<ChromeLibraryWidgetState & ChromeSyncActions>()(
  withChromeSync<ChromeLibraryWidgetState, ChromeLibraryPersistedState>({
    key: CHROME_LIBRARY_WIDGET_STORAGE_KEY,
    schema: chromeLibraryEnvelopeSchema,
    autoPersist: false,
    partialize: (state) => ({
      viewMode: state.viewMode,
    }),
    merge: (_current, incoming) => incoming,
  })((setState, getState) => {
    const refreshData = () => {
      if (!isChromeLibraryApiAvailable()) {
        setState({
          errorKey: 'apiUnavailable',
          groups: [],
          bookmarks: [],
          loading: false,
        })
        return
      }

      setState({ loading: true, errorKey: null })
      void Promise.all([getTabGroupsWithTabs(), getBookmarkTree()])
        .then(([groups, bookmarks]) => {
          setState({
            groups,
            bookmarks,
            loading: false,
          })
        })
        .catch(() => {
          setState({
            errorKey: 'loadError',
            groups: [],
            bookmarks: [],
            loading: false,
          })
        })
    }

    refreshData()
    globalThis.setInterval(refreshData, REFRESH_INTERVAL_MS)

    return {
      viewMode: 'sectioned',
      sectionedMode: 'groups',
      query: '',
      loading: false,
      errorKey: null,
      groups: [],
      bookmarks: [],
      expandedGroupIds: {},
      expandedFolderIds: {},
      setViewMode: (nextMode) => {
        setState({ viewMode: nextMode })
        const withSync = getState() as ChromeLibraryWidgetState & ChromeSyncActions
        void withSync.commit()
      },
      setSectionedMode: (nextMode) => setState({ sectionedMode: nextMode }),
      setQuery: (nextQuery) => setState({ query: nextQuery }),
      refreshData,
      toggleGroupExpanded: (groupId) => {
        setState((state) => ({
          expandedGroupIds: {
            ...state.expandedGroupIds,
            [groupId]: !state.expandedGroupIds[groupId],
          },
        }))
      },
      openGroup: (groupId, windowId) => {
        void openTabGroup(groupId, windowId)
          .then(() => {
            getState().refreshData()
          })
          .catch(() => {
            setState({ errorKey: 'openTabError' })
          })
      },
      openGroupTab: (tabId, windowId) => {
        void focusGroupedTab(tabId, windowId).catch(() => {
          setState({ errorKey: 'openTabError' })
        })
      },
      openBookmarkUrl: (url) => {
        void openBookmark(url).catch(() => {
          setState({ errorKey: 'openBookmarkError' })
        })
      },
      toggleFolderExpanded: (folderId) => {
        setState((state) => ({
          expandedFolderIds: {
            ...state.expandedFolderIds,
            [folderId]: !state.expandedFolderIds[folderId],
          },
        }))
      },
      resetExpandedState: () => {
        setState({
          expandedGroupIds: {},
          expandedFolderIds: {},
        })
      },
    }
  }),
)
