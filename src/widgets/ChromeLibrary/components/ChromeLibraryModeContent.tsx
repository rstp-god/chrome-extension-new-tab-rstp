import { Button } from '@/components/ui/button.tsx'
import { ChromeLibraryFavicon } from '@/widgets/ChromeLibrary/components/ChromeLibraryFavicon.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { ChromeLibraryBookmarkTree } from '@/widgets/ChromeLibrary/components/ChromeLibraryBookmarkTree.tsx'
import { ChromeLibraryGroupList } from '@/widgets/ChromeLibrary/components/ChromeLibraryGroupList.tsx'
import { toBreadcrumb } from '@/widgets/ChromeLibrary/services/chromeLibrary.ts'
import {
  BookmarkLinkNode,
  BookmarkTreeItem,
  ChromeTabGroupView,
  CombinedLibraryItem
} from '@/widgets/ChromeLibrary/types/types.ts';
import { BookmarkIcon, LayersIcon, MonitorIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  viewMode: 'sectioned' | 'combined'
  sectionedMode: 'groups' | 'bookmarks'
  isQueryMode: boolean
  filteredGroups: ChromeTabGroupView[]
  bookmarks: BookmarkTreeItem[]
  filteredBookmarks: BookmarkLinkNode[]
  expandedGroupIds: Record<number, boolean>
  expandedFolderIds: Record<string, boolean>
  combinedItems: CombinedLibraryItem[]
  onToggleGroup: (groupId: number) => void
  onOpenTab: (tabId: number, windowId: number) => void
  onOpenGroup: (groupId: number, windowId: number) => void
  onToggleFolder: (folderId: string) => void
  onOpenBookmark: (url: string) => void
}

export function ChromeLibraryModeContent({
  viewMode,
  sectionedMode,
  isQueryMode,
  filteredGroups,
  bookmarks,
  filteredBookmarks,
  expandedGroupIds,
  expandedFolderIds,
  combinedItems,
  onToggleGroup,
  onOpenTab,
  onOpenGroup,
  onToggleFolder,
  onOpenBookmark,
}: Props) {
  const { t } = useTranslation('chromeLibraryWidget')

  switch (viewMode) {
    case 'sectioned': {
      return (
        <>
          {sectionedMode === 'groups' && (
            <section className="grid gap-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <LayersIcon className="size-4" />
                {t('labels.groups')}
              </div>
              <ChromeLibraryGroupList
                groups={filteredGroups}
                expandedGroupIds={expandedGroupIds}
                onToggleGroup={onToggleGroup}
                onOpenTab={onOpenTab}
                onOpenGroup={onOpenGroup}
                noGroupsLabel={t('messages.noGroups')}
                openGroupLabel={t('actions.openGroup')}
                untitledGroupLabel={t('labels.untitledGroup')}
                tabsCountLabel={(count) => t('labels.tabsCount', { count })}
                noTabsLabel={t('messages.noTabs')}
              />
            </section>
          )}

          {sectionedMode === 'groups' && <Separator />}

          {sectionedMode === 'bookmarks' && (
            <section className="grid gap-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <BookmarkIcon className="size-4" />
                {t('labels.bookmarks')}
              </div>
              <ChromeLibraryBookmarkTree
                bookmarks={bookmarks}
                filteredBookmarks={filteredBookmarks}
                expandedFolderIds={expandedFolderIds}
                isQueryMode={isQueryMode}
                onToggleFolder={onToggleFolder}
                onOpenBookmark={onOpenBookmark}
                noBookmarksLabel={t('messages.noBookmarks')}
                untitledFolderLabel={t('labels.untitledFolder')}
                rootLabel={t('labels.root')}
              />
            </section>
          )}
        </>
      )
    }

    case 'combined': {
      return (
        <section className="grid gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <MonitorIcon className="size-4" />
            {t('labels.combinedList')}
          </div>

          {combinedItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {t('messages.noResults')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {combinedItems.map((item) => {
                if (item.kind === 'group') {
                  return (
                    <ChromeLibraryGroupList
                      key={`combined-group-${item.group.groupId}`}
                      groups={[item.group]}
                      expandedGroupIds={expandedGroupIds}
                      onToggleGroup={onToggleGroup}
                      onOpenTab={onOpenTab}
                      onOpenGroup={onOpenGroup}
                      noGroupsLabel={t('messages.noGroups')}
                      openGroupLabel={t('actions.openGroup')}
                      untitledGroupLabel={t('labels.untitledGroup')}
                      tabsCountLabel={(count) => t('labels.tabsCount', { count })}
                      noTabsLabel={t('messages.noTabs')}
                    />
                  )
                }

                return (
                  <Button
                    key={`combined-bookmark-${item.bookmark.id}`}
                    type="button"
                    variant="ghost"
                    className="h-auto justify-start rounded-xl border border-border/60 bg-muted/15 px-3 py-2 text-left"
                    onClick={() => onOpenBookmark(item.bookmark.url)}
                  >
                    <ChromeLibraryFavicon
                      url={item.bookmark.url}
                      className="mr-2 size-4 shrink-0 rounded-sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{item.bookmark.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {toBreadcrumb(item.bookmark.path) || t('labels.root')}
                      </div>
                    </div>
                  </Button>
                )
              })}
            </div>
          )}
        </section>
      )
    }
  }
}
