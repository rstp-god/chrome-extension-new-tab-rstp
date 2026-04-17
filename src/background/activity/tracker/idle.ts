import {
  IDLE_DETECTION_INTERVAL_MS,
  IDLE_DETECTION_INTERVAL_SEC,
} from '@/background/activity/constants.ts'
import { extractDomain } from '@/background/activity/tracker/domain.ts'
import { type SettingsGetter } from '@/background/activity/tracker/dispatch.ts'
import {
  endActiveSession,
  startSession,
} from '@/background/activity/tracker/session.ts'
import { state } from '@/background/activity/tracker/state.ts'

/**
 * `chrome.idle` integration. When the user stops interacting with the OS
 * for `IDLE_DETECTION_INTERVAL_SEC` seconds, we freeze time accumulation —
 * "tab left open while making coffee" should not count as screen time.
 *
 * Transitions:
 *   active → idle|locked : backdate `endActiveSession` to the start of the idle
 *                          window (now - threshold) and mark state.userIdle,
 *                          blocking any startSession until user returns.
 *   idle|locked → active : clear state.userIdle, look up the currently active
 *                          tab in the focused window, restart a fresh session.
 */

/** String union of idle states — enum itself isn't the runtime type `onStateChanged` delivers. */
export type IdleStateString = 'active' | 'idle' | 'locked'

export function handleIdleStateChange(
  newState: IdleStateString,
  settingsGetter: SettingsGetter,
): void {
  if (newState === 'active') {
    if (!state.userIdle) return // spurious
    state.userIdle = false
    state.activationSeq += 1
    resumeFocusedTab(settingsGetter)
    return
  }

  // idle | locked — user disengaged.
  if (state.userIdle) return // already idle
  state.userIdle = true
  // Backdate the session end: the user went idle `IDLE_DETECTION_INTERVAL_MS`
  // ago, so that trailing window shouldn't count as active time.
  const effectiveEnd = Date.now() - IDLE_DETECTION_INTERVAL_MS
  endActiveSession(effectiveEnd, 'window_focus', settingsGetter)
}

function resumeFocusedTab(settingsGetter: SettingsGetter): void {
  const seq = state.activationSeq
  chrome.tabs
    .query({ active: true, lastFocusedWindow: true })
    .then((tabs) => {
      if (seq !== state.activationSeq) return // superseded (tab switch, pause, etc)
      const tab = tabs[0]
      if (!tab || tab.id === undefined) return
      const domain = extractDomain(tab.url)
      if (!domain) return
      startSession(tab.id, domain, Date.now(), settingsGetter)
    })
    .catch((err: unknown) => {
      console.warn('[activity] idle-resume query failed', err)
    })
}

export function registerIdleListener(settingsGetter: SettingsGetter): void {
  chrome.idle.setDetectionInterval(IDLE_DETECTION_INTERVAL_SEC)
  chrome.idle.onStateChanged.addListener((newState) => {
    handleIdleStateChange(newState, settingsGetter)
  })
}
