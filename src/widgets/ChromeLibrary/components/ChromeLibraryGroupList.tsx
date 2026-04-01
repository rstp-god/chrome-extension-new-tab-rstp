import { Button } from '@/components/ui/button.tsx'
import { ChromeLibraryFavicon } from '@/widgets/ChromeLibrary/components/ChromeLibraryFavicon.tsx'
import { ChromeTabGroupColor, ChromeTabGroupView } from '@/widgets/ChromeLibrary/types/types.ts';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'

interface Props {
  groups: ChromeTabGroupView[]
  expandedGroupIds: Record<number, boolean>
  onToggleGroup: (groupId: number) => void
  onOpenTab: (tabId: number, windowId: number) => void
  onOpenGroup: (groupId: number, windowId: number) => void
  noGroupsLabel: string
  openGroupLabel: string
  untitledGroupLabel: string
  tabsCountLabel: (count: number) => string
  noTabsLabel: string
}

function getGroupColorClass(color: ChromeTabGroupColor) {
  const mapping: Record<ChromeTabGroupColor, string> = {
    grey: 'bg-zinc-400',
    blue: 'bg-sky-500',
    red: 'bg-rose-500',
    yellow: 'bg-amber-400',
    green: 'bg-emerald-500',
    pink: 'bg-fuchsia-500',
    purple: 'bg-violet-500',
    cyan: 'bg-cyan-500',
    orange: 'bg-orange-500',
  }

  return mapping[color]
}

export function ChromeLibraryGroupList({
  groups,
  expandedGroupIds,
  onToggleGroup,
  onOpenTab,
  onOpenGroup,
  noGroupsLabel,
  openGroupLabel,
  untitledGroupLabel,
  tabsCountLabel,
  noTabsLabel,
}: Props) {
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        {noGroupsLabel}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      {groups.map(({ groupId, windowId, title, color, tabsCount, tabs }) => {
        const isExpanded = Boolean(expandedGroupIds[groupId])

        return (
          <div
            key={`group-${groupId}`}
            className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-muted/20 p-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex h-auto min-w-0 flex-1 items-center justify-start gap-3 rounded-xl px-3 py-3"
                onClick={() => onToggleGroup(groupId)}
              >
                {isExpanded ? <ChevronDownIcon className="size-4 shrink-0" /> : <ChevronRightIcon className="size-4 shrink-0" />}
                <span className={`size-2.5 rounded-full ${getGroupColorClass(color)}`} />
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-medium">{title ?? untitledGroupLabel}</div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {tabsCountLabel(tabsCount)}
                    </span>
                  </div>
                </div>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 whitespace-nowrap px-2"
                onClick={() => onOpenGroup(groupId, windowId)}
              >
                {openGroupLabel}
              </Button>
            </div>

            {isExpanded && (
              <div className="mt-1 grid grid-cols-1 gap-1 px-1 pb-1">
                {tabs.length === 0 ? (
                  <div className="rounded-xl px-3 py-2 text-xs text-muted-foreground">{noTabsLabel}</div>
                ) : (
                  tabs.map((tab) => {
                    return (
                      <Button
                        key={`group-tab-${groupId}-${tab.tabId}`}
                        type="button"
                        variant="ghost"
                        className="h-auto min-w-0 justify-start rounded-xl px-3 py-2 text-left"
                        onClick={() => onOpenTab(tab.tabId, tab.windowId)}
                      >
                        <ChromeLibraryFavicon url={tab.url} className="mr-2 size-4 shrink-0 rounded-sm" />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">{tab.title || ' '}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{tab.url}</div>
                        </div>
                      </Button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
