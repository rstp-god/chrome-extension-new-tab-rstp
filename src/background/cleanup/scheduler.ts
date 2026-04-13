import type { TabRulesSettings } from '@/popup/types/rules.ts'

import { CLEANUP_THRESHOLD_MS } from '@/popup/types/rules.ts'
import { isSystemTab } from '@/popup/services/filter.ts'
import { getInactiveTabs } from '@/background/cleanup/activityTracker.ts'
import { showCleanupNotification } from '@/background/cleanup/notifications.ts'

const ALARM_NAME = 'cleanup-check'

export function setupCleanupScheduler(getSettings: () => TabRulesSettings | null): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 60 })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return
    runCleanupCheck(getSettings)
  })
}

async function runCleanupCheck(getSettings: () => TabRulesSettings | null): Promise<void> {
  const settings = getSettings()
  if (!settings?.cleanup.enabled) return

  const thresholdMs = CLEANUP_THRESHOLD_MS[settings.cleanup.threshold] ?? CLEANUP_THRESHOLD_MS['7d']
  const inactiveTabIds = getInactiveTabs(thresholdMs)

  if (inactiveTabIds.length === 0) return

  const allTabs = await chrome.tabs.query({})
  const activeTabIds = new Set(allTabs.filter((t) => t.active).map((t) => t.id))

  const eligibleTabIds = inactiveTabIds.filter((tabId) => {
    const tab = allTabs.find((t) => t.id === tabId)
    if (!tab) return false
    if (tab.pinned) return false
    if (activeTabIds.has(tabId)) return false
    if (isSystemTab(tab.url)) return false
    return true
  })

  if (eligibleTabIds.length === 0) return

  if (settings.cleanup.mode === 'auto') {
    await chrome.tabs.remove(eligibleTabIds)
  } else {
    for (const tabId of eligibleTabIds) {
      const tab = allTabs.find((t) => t.id === tabId)
      if (tab) {
        showCleanupNotification(tabId, tab.title ?? 'Untitled tab')
      }
    }
  }
}
