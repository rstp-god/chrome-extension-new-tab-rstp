import { openUrlInNewTab } from '@/services/chrome/common.ts'
import { getDemoBookmarkTree, getDemoTabGroupsWithTabs } from '@/services/chrome/demoProvider.ts'
import { getChromeObject, isShowcaseMode } from '@/services/chrome/runtime.ts'
import {
  BookmarkTreeItem,
  ChromeGroupedTab,
  ChromeTabGroupColor,
  ChromeTabGroupView,
} from '@/widgets/ChromeLibrary/types/types.ts'

function normalizeTitle(title: string | undefined | null) {
  return title?.trim() ?? ''
}

function getBookmarkItem(
  node: chrome.bookmarks.BookmarkTreeNode,
  path: string[] = [],
): BookmarkTreeItem | null {
  if (node.url) {
    return {
      kind: 'bookmark',
      id: node.id,
      title: normalizeTitle(node.title),
      url: node.url,
      path,
    }
  }

  const folderTitle = normalizeTitle(node.title)
  const nextPath = folderTitle ? [...path, folderTitle] : path
  const children =
    node.children
      ?.map((child) => getBookmarkItem(child, nextPath))
      .filter((child): child is BookmarkTreeItem => child != null) ?? []

  if (children.length === 0) return null

  return {
    kind: 'folder',
    id: node.id,
    title: folderTitle,
    children,
  }
}

function createGroupedTab(tab: chrome.tabs.Tab): ChromeGroupedTab | null {
  if (tab.groupId < 0 || tab.id == null) return null

  return {
    kind: 'tab',
    tabId: tab.id,
    windowId: tab.windowId,
    title: normalizeTitle(tab.title),
    url: tab.url ?? '',
  }
}

function createTabGroupView(
  group: chrome.tabGroups.TabGroup,
  tabsByGroup: Map<number, ChromeGroupedTab[]>,
): ChromeTabGroupView {
  const { id: groupId, windowId, title, color, collapsed } = group
  const tabs = tabsByGroup.get(groupId) ?? []

  return {
    groupId,
    windowId,
    title: normalizeTitle(title) || null,
    color: color as ChromeTabGroupColor,
    collapsed,
    tabsCount: tabs.length,
    tabs,
  }
}

export async function getBookmarkTree(): Promise<BookmarkTreeItem[]> {
  if (isShowcaseMode()) {
    return getDemoBookmarkTree()
  }

  const chromeObject = getChromeObject()
  if (!chromeObject?.bookmarks?.getTree) return []

  const roots = await chromeObject.bookmarks.getTree()
  const root = roots[0]
  const children = root?.children ?? []

  return children
    .map((node) => getBookmarkItem(node))
    .filter((node): node is BookmarkTreeItem => node != null)
}

export async function getTabGroupsWithTabs(): Promise<ChromeTabGroupView[]> {
  if (isShowcaseMode()) {
    return getDemoTabGroupsWithTabs()
  }

  const chromeObject = getChromeObject()
  if (!chromeObject?.tabGroups?.query || !chromeObject?.tabs?.query) return []

  const [groups, tabs] = await Promise.all([chromeObject.tabGroups.query({}), chromeObject.tabs.query({})])
  const tabsByGroup = new Map<number, ChromeGroupedTab[]>()

  tabs.forEach((tab) => {
    const groupedTab = createGroupedTab(tab)
    if (!groupedTab) return

    const current = tabsByGroup.get(tab.groupId) ?? []
    tabsByGroup.set(tab.groupId, [...current, groupedTab])
  })

  return groups
    .map((group) => createTabGroupView(group, tabsByGroup))
    .sort((left, right) => {
      if (left.windowId !== right.windowId) return left.windowId - right.windowId
      return (left.title ?? '').localeCompare(right.title ?? '')
    })
}

export async function focusGroupedTab(tabId: number, windowId: number) {
  if (isShowcaseMode()) return

  const chromeObject = getChromeObject()
  if (!chromeObject?.windows?.update || !chromeObject?.tabs?.update) return

  await chromeObject.windows.update(windowId, { focused: true })
  await chromeObject.tabs.update(tabId, { active: true })
}

export async function openTabGroup(groupId: number, windowId: number) {
  if (isShowcaseMode()) return

  const chromeObject = getChromeObject()
  if (!chromeObject?.tabGroups?.update || !chromeObject?.tabs?.query || !chromeObject?.windows?.update) return

  await chromeObject.tabGroups.update(groupId, { collapsed: false })
  const tabs = await chromeObject.tabs.query({ groupId, windowId })
  const targetTabId = (tabs.find((tab) => tab.active) ?? tabs[0])?.id

  if (targetTabId != null) {
    await focusGroupedTab(targetTabId, windowId)
    return
  }

  await chromeObject.windows.update(windowId, { focused: true })
}

export function openBookmark(url: string) {
  return openUrlInNewTab(url)
}
