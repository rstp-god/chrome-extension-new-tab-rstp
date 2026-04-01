import { Button } from '@/components/ui/button.tsx'
import { ChromeLibraryFavicon } from '@/widgets/ChromeLibrary/components/ChromeLibraryFavicon.tsx'
import {
  getFlattenedBookmarks,
  getFolderNodes,
  toBreadcrumb,
} from '@/widgets/ChromeLibrary/services/chromeLibrary.ts'
import { BookmarkFolderNode, BookmarkTreeItem } from '@/widgets/ChromeLibrary/types/types.ts'
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon } from 'lucide-react'
import { ReactNode } from 'react'

interface Props {
  bookmarks: BookmarkTreeItem[]
  filteredBookmarks: Array<Extract<BookmarkTreeItem, { kind: 'bookmark' }>>
  expandedFolderIds: Record<string, boolean>
  isQueryMode: boolean
  onToggleFolder: (folderId: string) => void
  onOpenBookmark: (url: string) => void
  noBookmarksLabel: string
  untitledFolderLabel: string
  rootLabel: string
}

export function ChromeLibraryBookmarkTree({
  bookmarks,
  filteredBookmarks,
  expandedFolderIds,
  isQueryMode,
  onToggleFolder,
  onOpenBookmark,
  noBookmarksLabel,
  untitledFolderLabel,
  rootLabel,
}: Props) {
  const sectionedFolders = getFolderNodes(bookmarks)
  const flattenedBookmarks = getFlattenedBookmarks(bookmarks)

  const renderFolderTree = (folder: BookmarkFolderNode, depth = 0): ReactNode => {
    const isExpanded = Boolean(expandedFolderIds[folder.id])
    const shouldShowExpand = folder.children.length > 0

    return (
      <div key={`folder-${folder.id}`} className="grid gap-1">
        <Button
          type="button"
          variant="ghost"
          className="h-auto justify-start rounded-xl px-2 py-2 text-left"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => onToggleFolder(folder.id)}
        >
          {shouldShowExpand ? (
            isExpanded ? (
              <ChevronDownIcon className="mr-2 size-4 shrink-0" />
            ) : (
              <ChevronRightIcon className="mr-2 size-4 shrink-0" />
            )
          ) : (
            <span className="mr-2 inline-block size-4 shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpenIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs">{folder.title || untitledFolderLabel}</span>
        </Button>

        {isExpanded && (
          <div className="grid gap-1">
            {folder.children.map((item) => {
              if (item.kind === 'folder') {
                return renderFolderTree(item, depth + 1)
              }

              return (
                <Button
                  key={`bookmark-${item.id}`}
                  type="button"
                  variant="ghost"
                  className="h-auto justify-start rounded-xl px-2 py-2 text-left"
                  style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
                  onClick={() => onOpenBookmark(item.url)}
                >
                  <ChromeLibraryFavicon
                    url={item.url}
                    className="mr-2 size-4 shrink-0 rounded-sm"
                  />
                  <span className="truncate text-xs">{item.title}</span>
                </Button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (isQueryMode) {
    if (filteredBookmarks.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          {noBookmarksLabel}
        </div>
      )
    }

    return (
      <div className="grid gap-2">
        {filteredBookmarks.map((bookmark) => (
          <Button
            key={`bookmark-query-${bookmark.id}`}
            type="button"
            variant="ghost"
            className="h-auto justify-start rounded-xl px-3 py-2 text-left"
            onClick={() => onOpenBookmark(bookmark.url)}
          >
            <ChromeLibraryFavicon url={bookmark.url} className="mr-2 size-4 shrink-0 rounded-sm" />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{bookmark.title}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {toBreadcrumb(bookmark.path) || rootLabel}
              </div>
            </div>
          </Button>
        ))}
      </div>
    )
  }

  if (sectionedFolders.length === 0 && flattenedBookmarks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        {noBookmarksLabel}
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {sectionedFolders.map((folder) => renderFolderTree(folder))}
      {bookmarks
        .filter((item) => item.kind === 'bookmark')
        .map((bookmark) => (
          <Button
            key={`bookmark-root-${bookmark.id}`}
            type="button"
            variant="ghost"
            className="h-auto justify-start rounded-xl px-2 py-2 text-left"
            onClick={() => onOpenBookmark(bookmark.url)}
          >
            <ChromeLibraryFavicon url={bookmark.url} className="mr-2 size-4 shrink-0 rounded-sm" />
            <span className="truncate text-xs">{bookmark.title}</span>
          </Button>
        ))}
    </div>
  )
}
