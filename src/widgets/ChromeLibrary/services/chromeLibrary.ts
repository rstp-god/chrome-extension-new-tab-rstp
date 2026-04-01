import {
  BookmarkFolderNode,
  BookmarkLinkNode,
  BookmarkTreeItem,
  ChromeTabGroupView,
  CombinedLibraryItem
} from '@/widgets/ChromeLibrary/types/types.ts';


function normalizeTitle(title: string | undefined | null) {
  return title?.trim() ?? ''
}

function flattenBookmarkTree(items: BookmarkTreeItem[]): BookmarkLinkNode[] {
  const result: BookmarkLinkNode[] = []

  const walk = (item: BookmarkTreeItem) => {
    if (item.kind === 'bookmark') {
      result.push(item)
      return
    }

    item.children.forEach(walk)
  }

  items.forEach(walk)
  return result
}

function groupMatchesQuery(group: ChromeTabGroupView, query: string) {
  if (!query) return true

  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  const groupTitle = normalizeTitle(group.title).toLowerCase()
  if (groupTitle.includes(normalized)) return true

  return group.tabs.some((tab) => {
    return tab.title.toLowerCase().includes(normalized) || tab.url.toLowerCase().includes(normalized)
  })
}

function bookmarkMatchesQuery(bookmark: BookmarkLinkNode, query: string) {
  if (!query) return true

  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return (
    bookmark.title.toLowerCase().includes(normalized) ||
    bookmark.url.toLowerCase().includes(normalized) ||
    bookmark.path.join(' / ').toLowerCase().includes(normalized)
  )
}

export function getFlattenedBookmarks(items: BookmarkTreeItem[]) {
  return flattenBookmarkTree(items)
}

export function buildCombinedItems(
  groups: ChromeTabGroupView[],
  bookmarks: BookmarkTreeItem[],
  query: string,
): CombinedLibraryItem[] {
  const groupItems: CombinedLibraryItem[] = groups
    .filter((group) => groupMatchesQuery(group, query))
    .map((group) => ({
      kind: 'group',
      group,
    }))
  const bookmarkItems: CombinedLibraryItem[] = flattenBookmarkTree(bookmarks)
    .filter((bookmark) => bookmarkMatchesQuery(bookmark, query))
    .map((bookmark) => ({
      kind: 'bookmark',
      bookmark,
    }))

  return [...groupItems, ...bookmarkItems]
}

export function filterGroups(groups: ChromeTabGroupView[], query: string) {
  return groups.filter((group) => groupMatchesQuery(group, query))
}

export function filterBookmarks(bookmarks: BookmarkTreeItem[], query: string) {
  return flattenBookmarkTree(bookmarks).filter((bookmark) => bookmarkMatchesQuery(bookmark, query))
}

export function toBreadcrumb(path: string[]) {
  return path.join(' / ')
}

export function getFolderNodes(items: BookmarkTreeItem[]): BookmarkFolderNode[] {
  return items.filter((item): item is BookmarkFolderNode => item.kind === 'folder')
}

export function getFaviconUrl(url: string) {
  if (!url) return ''
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=64`
}
