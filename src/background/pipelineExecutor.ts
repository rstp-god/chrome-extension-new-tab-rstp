import type { TabRulesSettings } from '@/popup/types/rules.ts'

import { isProcessableTab } from '@/popup/utils/filter.ts'
import { executePipeline } from '@/popup/services/pipeline.ts'
import { createOrUpdateGroup, getAllTabs, ungroupTab } from '@/background/chromeAdapter.ts'

let running = false

const everManagedGroupNames = new Set<string>()

export function isApplying(): boolean {
  return running
}

export async function executePipelineAndApply(settings: TabRulesSettings): Promise<void> {
  if (running) return
  running = true

  try {
    const allTabs = await getAllTabs()

    const activeTabs = allTabs.filter((t) => t.active)
    const activeTabId = activeTabs[0]?.id

    const result = executePipeline(allTabs, settings, activeTabId)
    const isGlobal = settings.sorting.scope === 'global'

    const currentGroupNames = new Set(result.groups.map((g) => g.name))

    for (const name of currentGroupNames) {
      everManagedGroupNames.add(name)
    }

    for (const rule of settings.rules) {
      everManagedGroupNames.add(rule.group.name)
    }

    const targetGroupForTab = new Map<number, string>()
    for (const group of result.groups) {
      for (const tabId of group.tabIds) {
        targetGroupForTab.set(tabId, group.name)
      }
    }

    const groupIdToName = new Map<number, string>()
    const groupNameToWindow = new Map<string, number>()
    try {
      const chromeGroups = await chrome.tabGroups.query({})
      for (const g of chromeGroups) {
        if (g.title) {
          groupIdToName.set(g.id, g.title)
          if (!groupNameToWindow.has(g.title)) {
            groupNameToWindow.set(g.title, g.windowId)
          }
        }
      }
    } catch {
      /* tabGroups API might not be available */
    }

    for (const tab of allTabs) {
      if (tab.id === undefined || tab.groupId === -1) continue
      if (!isProcessableTab(tab)) continue

      const currentGroupName = groupIdToName.get(tab.groupId)
      if (!currentGroupName || !everManagedGroupNames.has(currentGroupName)) {
        continue
      }

      const targetGroup = targetGroupForTab.get(tab.id)
      if (!targetGroup) {
        await ungroupTab(tab.id)
      }
    }

    for (const name of everManagedGroupNames) {
      if (!currentGroupNames.has(name) && !settings.rules.some((r) => r.group.name === name)) {
        everManagedGroupNames.delete(name)
      }
    }

    for (const group of result.groups) {
      if (group.tabIds.length === 0) continue

      if (isGlobal) {
        const targetWindowId =
          groupNameToWindow.get(group.name) ??
          allTabs.find((t) => t.id === group.tabIds[0])?.windowId

        if (targetWindowId === undefined) continue

        const tabsToMove = group.tabIds.filter((tabId) => {
          const tab = allTabs.find((t) => t.id === tabId)
          return tab && tab.windowId !== targetWindowId
        })

        for (const tabId of tabsToMove) {
          try {
            await chrome.tabs.move(tabId, { windowId: targetWindowId, index: -1 })
          } catch {
            /* tab might have been closed */
          }
        }

        await createOrUpdateGroup(targetWindowId, group.name, group.color, group.tabIds)
      } else {
        const tabsByWindow = new Map<number, number[]>()
        for (const tabId of group.tabIds) {
          const tab = allTabs.find((t) => t.id === tabId)
          if (!tab) continue
          const existing = tabsByWindow.get(tab.windowId) ?? []
          existing.push(tabId)
          tabsByWindow.set(tab.windowId, existing)
        }

        for (const [windowId, tabIds] of tabsByWindow) {
          await createOrUpdateGroup(windowId, group.name, group.color, tabIds)
        }
      }
    }
  } finally {
    await new Promise((r) => setTimeout(r, 200))
    running = false
  }
}
