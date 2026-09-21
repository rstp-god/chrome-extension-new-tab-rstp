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
import { setupVikunjaPull } from '@/background/vikunja/alarm.ts'
import { setupVikunjaBridge } from '@/background/vikunja/index.ts'

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

/**
 * Hydrate persisted state from `chrome.storage.local`. All async I/O of the
 * boot sequence lives here — listeners and schedulers attach synchronously
 * once this resolves. Each load degrades gracefully so a single corrupt key
 * doesn't take down the whole worker.
 */
async function hydratePersistedState(): Promise<void> {
  // Tab Rules settings — must load before listeners use them.
  try {
    const items = await chrome.storage.local.get(TAB_RULES_KEY)
    const loaded = loadSettingsFromStorage(items[TAB_RULES_KEY])
    if (loaded) currentSettings = loaded
  } catch (err) {
    console.warn('[background] tab-rules load failed; using defaults', err)
  }

  // Cleanup fallback map. Empty map is still a working state (Chrome's
  // `tab.lastAccessed` is the primary age source) — far better than letting
  // the throw kill the cleanup scheduler entirely.
  try {
    await restoreFromStorage()
  } catch (err) {
    console.warn('[cleanup] restoreFromStorage failed; starting with empty map', err)
  }

  // Activity feature has its own settings + initializer.
  await initActivitySettings()
}

/**
 * Wire all chrome.* event listeners and alarm schedulers. Must run AFTER
 * `hydratePersistedState` so settings reads from inside listeners see the
 * persisted values, and the cleanup tracker doesn't overwrite the restored
 * map with `now` for every existing tab.
 */
function attachListeners(): void {
  setupMessageHandler(getSettings)
  setupEventListeners(getSettings)
  setupActivityTracking()
  setupCleanupScheduler(getSettings)
  setupNotificationHandlers()
  setupDomainActivityTracking(getActivitySettings)
  setupActivityAlarms(getActivitySettings)
}

async function bootstrap(): Promise<void> {
  await hydratePersistedState()
  attachListeners()
}

/**
 * Registered at module top level, NOT from `attachListeners`. MV3 dispatches
 * the event that woke a cold worker as soon as the script finishes
 * evaluating — long before `hydratePersistedState()` resolves. A listener
 * attached after that await would miss the very message that started the
 * worker, and the sender would see `lastError` and read it as a network
 * failure. The bridge holds no state, so it needs no readiness gate; ops
 * that need persisted data read storage themselves.
 */
setupVikunjaBridge()

/**
 * Same rule, same reason: `chrome.alarms.onAlarm` for the background Vikunja
 * pull is dispatched right after script evaluation when the alarm is what woke
 * the worker, and the alarm fires at most a few times an hour — a missed one
 * is a whole period of the widget showing stale data. `setupVikunjaPull` reads
 * its schedule from storage itself, so it needs no readiness gate either.
 */
setupVikunjaPull()

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
