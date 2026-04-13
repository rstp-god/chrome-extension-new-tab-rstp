import type { TabRulesSettings } from '@/popup/types/rules.ts'
import { DEFAULT_TAB_RULES_SETTINGS, TAB_RULES_KEY } from '@/popup/types/rules.ts'
import { tabRulesSettingsSchema } from '@/popup/services/schema.ts'
import { restoreFromStorage, setupActivityTracking } from '@/background/cleanup/activityTracker.ts'
import { setupNotificationHandlers } from '@/background/cleanup/notifications.ts'
import { setupCleanupScheduler } from '@/background/cleanup/scheduler.ts'
import { setupEventListeners } from '@/background/eventListeners.ts'
import { setupMessageHandler } from '@/background/messageHandler.ts'

let currentSettings: TabRulesSettings = DEFAULT_TAB_RULES_SETTINGS

function getSettings(): TabRulesSettings | null {
  return currentSettings
}

function loadSettingsFromStorage(raw: unknown): TabRulesSettings | null {
  if (!raw || typeof raw !== 'object') return null

  const envelope = raw as { state?: unknown }
  if (!envelope.state) return null

  const result = tabRulesSettingsSchema.safeParse(envelope.state)
  return result.success ? result.data : null
}

// Load settings on startup
chrome.storage.local.get(TAB_RULES_KEY, (items) => {
  const loaded = loadSettingsFromStorage(items[TAB_RULES_KEY])
  if (loaded) {
    currentSettings = loaded
  }
})

// Listen for settings changes from popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  const change = changes[TAB_RULES_KEY]
  if (!change?.newValue) return

  const loaded = loadSettingsFromStorage(change.newValue)
  if (loaded) {
    currentSettings = loaded
  }
})

// Set up message handler, event listeners, and cleanup
setupMessageHandler(getSettings)
setupEventListeners(getSettings)
setupActivityTracking()
setupCleanupScheduler(getSettings)
setupNotificationHandlers()
void restoreFromStorage()
