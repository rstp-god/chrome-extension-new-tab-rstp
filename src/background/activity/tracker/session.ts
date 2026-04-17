import { MAX_SESSION_DURATION_MS } from '@/background/activity/constants.ts'
import { dispatchEvent, type SettingsGetter } from '@/background/activity/tracker/dispatch.ts'
import { state } from '@/background/activity/tracker/state.ts'
import type { ActivityEventType } from '@/background/activity/types.ts'

/**
 * Active-session lifecycle. A session is an interval during which a single
 * tab+domain has user focus. Transitions (activate/navigate/close/window-focus)
 * call `endActiveSession`; freshly-focused tabs call `startSession`.
 *
 * Pause semantics: `startSession` is a no-op when paused, and `onPauseChanged(true)`
 * drops the in-flight session without emitting its accumulated duration —
 * resume starts from the next real activation.
 *
 * Heartbeat: the hourly alarm calls `emitHeartbeat` so long-lived tabs don't
 * lose time when the worker suspends.
 */

function clampDuration(ms: number): number {
  return Math.max(0, Math.min(MAX_SESSION_DURATION_MS, ms))
}

export function endActiveSession(
  now: number,
  eventType: ActivityEventType,
  settingsGetter: SettingsGetter,
): void {
  const session = state.activeSession
  state.activeSession = null
  if (!session) return
  if (settingsGetter().paused) return
  dispatchEvent(
    {
      timestamp: now,
      domain: session.domain,
      tabId: session.tabId,
      eventType,
      duration: clampDuration(now - session.startedAt),
    },
    settingsGetter,
  )
}

export function startSession(
  tabId: number,
  domain: string,
  now: number,
  settingsGetter: SettingsGetter,
): void {
  if (settingsGetter().paused) return
  if (state.userIdle) return
  state.activeSession = { tabId, domain, startedAt: now }
  state.tabDomain.set(tabId, domain)
}

/**
 * Pause transition hook. On pause, drop the active session with no dispatch;
 * on resume, no-op (the next real activation restarts timing).
 */
export function onPauseChanged(paused: boolean): void {
  if (paused) {
    state.activeSession = null
    state.activationSeq += 1
  }
}

/**
 * Emit a duration slice for the current active session without ending it,
 * then restart its clock at `now`. Called by the rollup alarm.
 */
export function emitHeartbeat(settingsGetter: SettingsGetter): void {
  const session = state.activeSession
  if (!session) return
  if (settingsGetter().paused) return
  const now = Date.now()
  const duration = clampDuration(now - session.startedAt)
  if (duration <= 0) return
  dispatchEvent(
    {
      timestamp: now,
      domain: session.domain,
      tabId: session.tabId,
      eventType: 'tab_activated',
      duration,
    },
    settingsGetter,
  )
  session.startedAt = now
}
