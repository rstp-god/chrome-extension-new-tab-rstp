import type { TabRulesSettings } from '@/popup/types/rules.ts'

import { getLastActive } from '@/background/cleanup/activityTracker.ts'
import { showCleanupNotification } from '@/background/cleanup/notifications.ts'
import { CLEANUP_THRESHOLD_MS } from '@/popup/types/rules.ts'
import { isSystemTab } from '@/popup/utils/filter.ts'

const ALARM_NAME = 'cleanup-check'
const CHECK_PERIOD_MIN = 60

/**
 * The cleanup scheduler closes (or asks to close) tabs the user hasn't
 * touched in at least `settings.cleanup.threshold` wall-clock days.
 *
 * Age source: `chrome.tabs.Tab.lastAccessed` (Chrome 121+, 2024). Chrome
 * itself maintains this timestamp across MV3 worker suspensions and browser
 * restarts, which is what previously broke this feature — our own in-memory
 * `lastActive` map was reset on every worker wake. The tracker map is kept
 * as a fallback for older Chrome builds that don't populate `lastAccessed`.
 *
 * Tab groups: grouped tabs are intentionally NOT filtered out — a tab
 * spending months in a group without ever being viewed is still inactive.
 * Pinned, currently-active, and chrome:// tabs are excluded.
 */
export function setupCleanupScheduler(getSettings: () => TabRulesSettings | null): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_PERIOD_MIN })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return
    void runCleanupCheck(getSettings).catch((err: unknown) => {
      console.warn('[cleanup] check failed', err)
    })
  })
}

export async function runCleanupCheck(getSettings: () => TabRulesSettings | null): Promise<void> {
  const settings = getSettings()
  if (!settings?.cleanup.enabled) return

  const thresholdMs = CLEANUP_THRESHOLD_MS[settings.cleanup.threshold] ?? CLEANUP_THRESHOLD_MS['7d']
  const now = Date.now()
  const allTabs = await chrome.tabs.query({})

  const eligible = allTabs.filter((tab) => isEligibleForCleanup(tab, now, thresholdMs))
  if (eligible.length === 0) return

  if (settings.cleanup.mode === 'auto') {
    // Remove tabs one-by-one rather than batching: `chrome.tabs.remove(ids)`
    // rejects the entire promise if any single id is invalid (e.g. the user
    // closed the tab between our query and our remove call), and that
    // rejection causes Chrome to skip ALL the other still-valid ids in the
    // batch. Per-id loop with isolated catches lets one stale id fail
    // without taking down the whole cleanup run.
    for (const tab of eligible) {
      if (tab.id === undefined) continue
      try {
        await chrome.tabs.remove(tab.id)
      } catch (err) {
        console.warn('[cleanup] remove failed for tab', tab.id, err)
      }
    }
    return
  }

  for (const tab of eligible) {
    if (tab.id === undefined) continue
    showCleanupNotification(tab.id, tab.title ?? 'Untitled tab')
  }
}

function isEligibleForCleanup(tab: chrome.tabs.Tab, now: number, thresholdMs: number): boolean {
  if (tab.id === undefined) return false
  if (tab.pinned) return false
  if (tab.active) return false
  if (isSystemTab(tab.url)) return false
  return now - resolveLastTouchedTs(tab, now) > thresholdMs
}

function resolveLastTouchedTs(tab: chrome.tabs.Tab, now: number): number {
  // Chrome's own timestamp is the authoritative source: it survives worker
  // suspension and browser restart, and is updated whenever the tab becomes
  // the active tab in its window.
  if (typeof tab.lastAccessed === 'number' && tab.lastAccessed > 0) {
    return tab.lastAccessed
  }
  // Fallback: our tracked map (Chrome <121, or tabs that were never active).
  // If the tab is unknown to us as well, treat it as "just touched" so we
  // never close a tab on uncertain provenance.
  if (tab.id !== undefined) {
    const tracked = getLastActive(tab.id)
    if (tracked !== undefined) return tracked
  }
  return now
}
