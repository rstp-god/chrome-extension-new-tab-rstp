import type { ChromeGroupColor, TabRulesSettings } from '@/popup/types/rules.ts'
import { isProcessableTab } from '@/popup/services/filter.ts'
import { groupTabs } from '@/popup/services/grouping.ts'
import { applyActiveTabOnTop, sortGroups, sortTabsInGroup } from '@/popup/services/sorting.ts'

export interface PipelineGroupResult {
  name: string
  color: ChromeGroupColor
  tabIds: number[]
}

export interface PipelineResult {
  groups: PipelineGroupResult[]
  ungroupedTabIds: number[]
}

export function executePipeline(
  allTabs: chrome.tabs.Tab[],
  settings: TabRulesSettings,
  activeTabId?: number,
): PipelineResult {
  // Step 1: Filter
  const processable = allTabs.filter(isProcessableTab)

  // Step 2: Group
  const grouped = groupTabs(
    processable,
    settings.rules,
    settings.unmatchedTabs.behavior,
    settings.unmatchedTabs.otherGroupColor,
  )

  // Step 3: Sort groups
  const sortedGroups =
    settings.sorting.scope !== 'off'
      ? sortGroups(grouped, settings.sorting.groupSort)
      : grouped

  // Step 4: Sort tabs within groups + apply active tab on top
  const result: PipelineGroupResult[] = []
  const allGroupedTabIds = new Set<number>()

  for (const [, group] of sortedGroups) {
    let tabs = group.tabs

    if (settings.sorting.scope !== 'off') {
      tabs = sortTabsInGroup(tabs, settings.sorting.tabSort)
    }

    if (settings.sorting.activeTabOnTop) {
      tabs = applyActiveTabOnTop(tabs, activeTabId)
    }

    const tabIds = tabs.map((t) => t.id).filter((id): id is number => id !== undefined)
    tabIds.forEach((id) => allGroupedTabIds.add(id))

    result.push({
      name: group.name,
      color: group.color,
      tabIds,
    })
  }

  // Ungrouped tabs
  const ungroupedTabIds = processable
    .map((t) => t.id)
    .filter((id): id is number => id !== undefined && !allGroupedTabIds.has(id))

  return { groups: result, ungroupedTabIds }
}
