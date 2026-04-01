export type ChromeLibraryViewMode = 'sectioned' | 'combined'
export type ChromeTabGroupColor = chrome.tabGroups.TabGroup['color']

export interface BookmarkFolderNode {
  kind: 'folder'
  id: string
  title: string
  children: BookmarkTreeItem[]
}

export interface BookmarkLinkNode {
  kind: 'bookmark'
  id: string
  title: string
  url: string
  path: string[]
}

export type BookmarkTreeItem = BookmarkFolderNode | BookmarkLinkNode

export interface ChromeGroupedTab {
  kind: 'tab'
  tabId: number
  windowId: number
  title: string
  url: string
}

export interface ChromeTabGroupView {
  groupId: number
  windowId: number
  title: string | null
  color: ChromeTabGroupColor
  collapsed: boolean
  tabsCount: number
  tabs: ChromeGroupedTab[]
}

export interface CombinedGroupItem {
  kind: 'group'
  group: ChromeTabGroupView
}

export interface CombinedBookmarkItem {
  kind: 'bookmark'
  bookmark: BookmarkLinkNode
}

export type CombinedLibraryItem = CombinedGroupItem | CombinedBookmarkItem
