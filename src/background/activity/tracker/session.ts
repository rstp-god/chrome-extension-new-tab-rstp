import { SLEEP_DETECTION_THRESHOLD_MS } from '@/background/activity/constants.ts'
import { loadLastHeartbeatTs, saveLastHeartbeatTs } from '@/background/activity/storage.ts'
import { dispatchEvent, type SettingsGetter } from '@/background/activity/tracker/dispatch.ts'
import { extractDomain } from '@/background/activity/tracker/domain.ts'
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

function persistHeartbeatTs(ts: number): void {
  saveLastHeartbeatTs(ts).catch((err: unknown) => {
    console.warn('[activity] saveLastHeartbeatTs failed', err)
  })
}

/**
 * Decide what `startedAt` to use when re-priming a session after the worker
 * woke up. We trust the persisted heartbeat ts only if it's recent enough
 * (within sleep threshold) and not in the future (clock-skew guard).
 * Otherwise we start fresh from `now` and accept losing the gap.
 */
function resolveStartedAt(stored: number | null, now: number): number {
  if (stored === null) return now
  if (stored > now) return now // clock skew — don't trust the future
  if (now - stored > SLEEP_DETECTION_THRESHOLD_MS) return now // sleep / long suspension
  return stored
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
  const elapsed = now - session.startedAt
  // Sleep / OS-freeze artifact: the gap between session start and end exceeds
  // anything heartbeats could allow. Drop the duration rather than emit hours
  // of phantom time. The 24h `MAX_SESSION_DURATION_MS` clamp is too loose for
  // this — 8h sleeps still pollute the daily aggregate.
  if (elapsed > SLEEP_DETECTION_THRESHOLD_MS) {
    persistHeartbeatTs(now)
    return
  }
  dispatchEvent(
    {
      timestamp: now,
      domain: session.domain,
      tabId: session.tabId,
      eventType,
      duration: Math.max(0, elapsed),
    },
    settingsGetter,
  )
  persistHeartbeatTs(now)
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
 *
 * Persisting `lastHeartbeatTs = now` on pause is critical: without it,
 * `primeActiveSessionIfNeeded` after a worker wake would back-date
 * `startedAt` to the *previous* heartbeat (which was before the pause),
 * causing the entire paused window to be recorded as active screen time
 * on the next heartbeat dispatch. Stamping `now` here means the gap from
 * pause-instant onward is correctly treated as "no signal" by the primer.
 */
export function onPauseChanged(paused: boolean): void {
  if (paused) {
    state.activeSession = null
    state.activationSeq += 1
    persistHeartbeatTs(Date.now())
  }
}

/**
 * Recover `state.activeSession` from the currently-focused Chrome tab after
 * worker suspension wiped in-memory state. Called on tracker setup and before
 * every heartbeat alarm — if a user sits on one tab without switching, the
 * worker sleeps, `activeSession` is lost, and without this re-prime the
 * heartbeat would have nothing to record (30+ min on one tab → blank widget).
 *
 * Reads the persisted `lastHeartbeatTs` so the recovered session's `startedAt`
 * matches when the previous heartbeat was committed — without this, every
 * worker wake would lose all elapsed time since the last alarm. If the gap
 * exceeds `SLEEP_DETECTION_THRESHOLD_MS` (or there is no stored value), we
 * assume the OS was frozen and start fresh from `now`.
 */
export async function primeActiveSessionIfNeeded(settingsGetter: SettingsGetter): Promise<void> {
  if (state.activeSession) return
  if (settingsGetter().paused) return
  if (state.userIdle) return
  // Capture the supersession token before any awaits — same pattern as
  // `resumeSessionFor` / `handleWindowFocusChanged` / `resumeFocusedTab`.
  // If a real Chrome event (tab activation, window focus, idle) bumps the
  // seq while we're awaiting query/storage, our recovered focus is stale
  // and we must abort rather than write a session for the wrong tab.
  const seq = state.activationSeq
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (seq !== state.activationSeq) return
    const tab = tabs[0]
    if (!tab || tab.id === undefined) return
    const domain = extractDomain(tab.url)
    if (!domain) return
    const now = Date.now()
    const stored = await loadLastHeartbeatTs()
    if (seq !== state.activationSeq) return
    const startedAt = resolveStartedAt(stored, now)
    // Mirror `startSession` guards explicitly: re-check after the awaits in
    // case state changed (idle event, pause toggle).
    if (settingsGetter().paused) return
    if (state.userIdle) return
    if (state.activeSession) return
    state.activeSession = { tabId: tab.id, domain, startedAt }
    state.tabDomain.set(tab.id, domain)
  } catch (err) {
    console.warn('[activity] primeActiveSessionIfNeeded failed', err)
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
  const elapsed = now - session.startedAt
  // Sleep guard: the heartbeat alarm fires every `HEARTBEAT_PERIOD_MIN`. A
  // single slice larger than 2× that means the OS was frozen between alarms.
  // Reset the clock and persist the new ts but skip the dispatch so we don't
  // record hours of phantom activity.
  if (elapsed > SLEEP_DETECTION_THRESHOLD_MS) {
    session.startedAt = now
    persistHeartbeatTs(now)
    return
  }
  if (elapsed <= 0) {
    persistHeartbeatTs(now)
    return
  }
  dispatchEvent(
    {
      timestamp: now,
      domain: session.domain,
      tabId: session.tabId,
      eventType: 'tab_activated',
      duration: elapsed,
    },
    settingsGetter,
  )
  session.startedAt = now
  persistHeartbeatTs(now)
}
