import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { TestId } from '@tests/constants/testIds.ts'
import {
  buildCombinedItems,
  filterBookmarks,
  filterGroups,
} from '@/widgets/ChromeLibrary/services/chromeLibrary.ts'
import { useChromeLibraryStore } from '@/widgets/ChromeLibrary/store/store.ts'
import { ChromeLibraryModeContent } from '@/widgets/ChromeLibrary/components/ChromeLibraryModeContent.tsx'
import { ChromeLibrarySettingsDialog } from '@/widgets/ChromeLibrary/components/ChromeLibrarySettingsDialog.tsx'
import { Settings2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function ChromeLibraryWidget() {
  const { t } = useTranslation('chromeLibraryWidget')
  const { t: common } = useTranslation('common')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const {
    viewMode,
    sectionedMode,
    query,
    setSectionedMode,
    setQuery,
    loading,
    errorKey,
    groups,
    bookmarks,
    expandedGroupIds,
    expandedFolderIds,
    toggleGroupExpanded,
    openGroup,
    openGroupTab,
    toggleFolderExpanded,
    setViewMode,
    resetExpandedState,
    openBookmarkUrl,
  } = useChromeLibraryStore((state) => state)

  const filteredGroups = useMemo(() => filterGroups(groups, query), [groups, query])
  const filteredBookmarks = useMemo(() => filterBookmarks(bookmarks, query), [bookmarks, query])
  const combinedItems = useMemo(
    () => buildCombinedItems(groups, bookmarks, query),
    [bookmarks, groups, query],
  )
  const isQueryMode = query.trim().length > 0
  const errorMessage = errorKey ? t(`messages.${errorKey}`) : null

  const handleSwitchMode = (nextMode: 'sectioned' | 'combined') => {
    setViewMode(nextMode)
    resetExpandedState()
    setSettingsOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input
          data-testid={TestId.ChromeLibrarySearch}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchPlaceholder')}
        />
        <Button
          data-testid={TestId.ChromeLibraryOpenSettings}
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setSettingsOpen(true)}
          aria-label={t('actions.openSettings')}
        >
          <Settings2Icon className="size-4" />
        </Button>
      </div>

      {viewMode === 'sectioned' && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid={TestId.ChromeLibraryModeGroups}
            type="button"
            variant={sectionedMode === 'groups' ? 'default' : 'outline'}
            onClick={() => setSectionedMode('groups')}
          >
            {t('labels.groups')}
          </Button>
          <Button
            data-testid={TestId.ChromeLibraryModeBookmarks}
            type="button"
            variant={sectionedMode === 'bookmarks' ? 'default' : 'outline'}
            onClick={() => setSectionedMode('bookmarks')}
          >
            {t('labels.bookmarks')}
          </Button>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1 pr-2">
        <div className="grid gap-4">
          {loading && <div className="text-sm text-muted-foreground">{t('messages.loading')}</div>}

          {!loading && errorMessage && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {!loading && !errorMessage && (
            <ChromeLibraryModeContent
              viewMode={viewMode}
              sectionedMode={sectionedMode}
              isQueryMode={isQueryMode}
              filteredGroups={filteredGroups}
              bookmarks={bookmarks}
              filteredBookmarks={filteredBookmarks}
              expandedGroupIds={expandedGroupIds}
              expandedFolderIds={expandedFolderIds}
              combinedItems={combinedItems}
              onToggleGroup={toggleGroupExpanded}
              onOpenGroup={openGroup}
              onOpenTab={openGroupTab}
              onToggleFolder={toggleFolderExpanded}
              onOpenBookmark={openBookmarkUrl}
            />
          )}
        </div>
      </ScrollArea>

      <ChromeLibrarySettingsDialog
        open={settingsOpen}
        viewMode={viewMode}
        title={t('settings.title')}
        description={t('settings.description')}
        sectionedLabel={t('settings.sectioned')}
        combinedLabel={t('settings.combined')}
        closeLabel={common('close')}
        onOpenChange={setSettingsOpen}
        onSwitchMode={handleSwitchMode}
      />
    </div>
  )
}
