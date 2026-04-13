import type { TabRulesSettings } from '@/popup/types/rules.ts'
import { isSystemTab } from '@/popup/services/filter.ts'
import { getInactiveTabs } from '@/background/cleanup/activityTracker.ts'
import { showCleanupNotification } from '@/background/cleanup/notifications.ts'

const ALARM_NAME = 'cleanup-check'

const THRESHOLD_MS: Record<string, number> = {
  '1d': 1 * 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  '4d': 4 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '28d': 28 * 24 * 60 * 60 * 1000,
}

export function setupCleanupScheduler(getSettings: () => TabRulesSettings | null): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 60 })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return
    void runCleanupCheck(getSettings)
  })
}

async function runCleanupCheck(getSettings: () => TabRulesSettings | null): Promise<void> {
  const settings = getSettings()
  if (!settings?.cleanup.enabled) return

  const thresholdMs = THRESHOLD_MS[settings.cleanup.threshold] ?? THRESHOLD_MS['7d']
  const inactiveTabIds = getInactiveTabs(thresholdMs)

  if (inactiveTabIds.length === 0) return

  // Filter out protected tabs
  const allTabs = await chrome.tabs.query({})
  const activeTabIds = new Set(
    allTabs.filter((t) => t.active).map((t) => t.id),
  )

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
    // Ask mode — show notification for each tab
    for (const tabId of eligibleTabIds) {
      const tab = allTabs.find((t) => t.id === tabId)
      if (tab) {
        showCleanupNotification(tabId, tab.title ?? 'Untitled tab')
      }
    }
  }
}
