import type { TabRulesSettings } from '@/popup/types/rules.ts'

import { DEFAULT_TAB_RULES_SETTINGS, TAB_RULES_KEY } from '@/popup/types/rules.ts'
import { tabRulesSettingsSchema } from '@/popup/services/schema.ts'
import { setupActivityAlarms } from '@/background/activity/alarms.ts'
import { getActivitySettings, initActivitySettings } from '@/background/activity/settings.ts'
import { setupActivityTracking as setupDomainActivityTracking } from '@/background/activity/tracker.ts'
import { restoreFromStorage, setupActivityTracking } from '@/background/cleanup/activityTracker.ts'
import { setupNotificationHandlers } from '@/background/cleanup/notifications.ts'
import { setupCleanupScheduler } from '@/background/cleanup/scheduler.ts'
import { setupEventListeners } from '@/background/eventListeners.ts'
import { setupMessageHandler } from '@/background/messageHandler.ts'
import { executePipelineAndApply } from '@/background/pipelineExecutor.ts'

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

async function bootstrap(): Promise<void> {
  // Tab Rules settings — must load before listeners use them.
  const items = await chrome.storage.local.get(TAB_RULES_KEY)
  const loaded = loadSettingsFromStorage(items[TAB_RULES_KEY])
  if (loaded) currentSettings = loaded

  setupMessageHandler(getSettings)
  setupEventListeners(getSettings)
  setupActivityTracking()
  setupCleanupScheduler(getSettings)
  setupNotificationHandlers()
  restoreFromStorage()

  // Activity settings — same pattern, but bundled with its own init function.
  await initActivitySettings()
  setupDomainActivityTracking(getActivitySettings)
  setupActivityAlarms(getActivitySettings)
}

bootstrap().catch((err: unknown) => {
  console.error('[background] bootstrap failed', err)
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  const change = changes[TAB_RULES_KEY]
  if (!change?.newValue) return

  const loaded = loadSettingsFromStorage(change.newValue)
  if (loaded) {
    currentSettings = loaded
    executePipelineAndApply(currentSettings)
  }
})
