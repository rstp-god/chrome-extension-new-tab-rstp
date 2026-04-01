import {
  focusGroupedTab,
  getBookmarkTree,
  getTabGroupsWithTabs,
  openBookmark,
  openTabGroup,
} from '@/services/chrome/chromeLibrary.ts'
import {
  CHROME_BOOKMARK_EVENTS,
  CHROME_TAB_EVENTS,
  CHROME_TAB_GROUP_EVENTS,
} from '@/services/chrome/events.ts'
import { ChromeSyncActions, withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import { debounce } from '@/utils/debounce.ts'
import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import { BookmarkTreeItem, ChromeLibraryViewMode, ChromeTabGroupView, } from '@/widgets/ChromeLibrary/types/types.ts'
import { z } from 'zod'
import { create } from 'zustand/react'

export const CHROME_LIBRARY_WIDGET_STORAGE_KEY = 'chrome-library-widget:v1'

const LIBRARY_RELOAD_DEBOUNCE_MS = 150

const chromeLibraryPersistedStateSchema = z.object({
  viewMode: z.union([ z.literal('sectioned'), z.literal('combined') ]),
})

const chromeLibraryEnvelopeSchema = makeEnvelopeSchema(chromeLibraryPersistedStateSchema)

type ChromeLibraryPersistedState = z.infer<typeof chromeLibraryPersistedStateSchema>

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
    autoPersist: true,
    partialize: (state) => ({
      viewMode: state.viewMode,
    }),
    merge: (_current, incoming) => incoming,
  })((setState) => {
    let reloadInFlight: Promise<void> | null = null

    const reloadLibrary = async () => {
      if (reloadInFlight) return reloadInFlight

      setState({ loading: true, errorKey: null })
      reloadInFlight = Promise.all([ getTabGroupsWithTabs(), getBookmarkTree() ])
        .then(([ groups, bookmarks ]) => {
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
        .finally(() => {
          reloadInFlight = null
        })

      return reloadInFlight
    }

    const scheduleReload = debounce(() => {
      void reloadLibrary()
    }, LIBRARY_RELOAD_DEBOUNCE_MS)

    ;[...CHROME_TAB_EVENTS, ...CHROME_TAB_GROUP_EVENTS, ...CHROME_BOOKMARK_EVENTS].forEach((event) => {
      event?.addListener(scheduleReload)
    })

    void reloadLibrary()

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
      },
      setSectionedMode: (nextMode) => setState({ sectionedMode: nextMode }),
      setQuery: (nextQuery) => setState({ query: nextQuery }),
      toggleGroupExpanded: (groupId) => {
        setState((state) => ({
          expandedGroupIds: {
            ...state.expandedGroupIds,
            [groupId]: !state.expandedGroupIds[groupId],
          },
        }))
      },
      openGroup: (groupId, windowId) => {
        openTabGroup(groupId, windowId).catch(() => {
          setState({ errorKey: 'openTabError' })
        })
      },
      openGroupTab: (tabId, windowId) => {
        focusGroupedTab(tabId, windowId).catch(() => {
          setState({ errorKey: 'openTabError' })
        })
      },
      openBookmarkUrl: (url) => {
        openBookmark(url).catch(() => {
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
