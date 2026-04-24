import { ACTIVITY_KEYS } from '@/background/activity/constants.ts'
import { DEFAULT_ACTIVITY_SETTINGS } from '@/background/activity/defaults.ts'
import { loadSettings } from '@/background/activity/storage.ts'
import { onPauseChanged } from '@/background/activity/tracker.ts'
import type { ActivitySettings } from '@/background/activity/types.ts'
import { activitySettingsEnvelope } from '@/services/zod/activitySchemas.ts'

/**
 * Worker-side settings cache. UI owns writes (via withChromeSync); worker
 * reads once at boot and subscribes to changes so `paused` takes effect
 * immediately across windows. See README.md for the full settings flow.
 */

let current: ActivitySettings = DEFAULT_ACTIVITY_SETTINGS

export function getActivitySettings(): ActivitySettings {
  return current
}

export async function initActivitySettings(): Promise<void> {
  current = await loadSettings()
  chrome.storage.onChanged.addListener(handleStorageChange)
}

function handleStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  area: chrome.storage.AreaName,
): void {
  if (area !== 'local') return
  const change = changes[ACTIVITY_KEYS.settings]
  if (!change?.newValue) return
  applySettingsChange(change.newValue)
}

function applySettingsChange(newValue: unknown): void {
  const parsed = activitySettingsEnvelope.safeParse(newValue)
  if (!parsed.success) return
  const prevPaused = current.paused
  current = parsed.data.state
  if (prevPaused !== current.paused) {
    onPauseChanged(current.paused)
  }
}
