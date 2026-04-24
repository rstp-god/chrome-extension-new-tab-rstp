import { flushPendingWrites, type SettingsGetter } from '@/background/activity/tracker/dispatch.ts'
import { emitHeartbeat, endActiveSession } from '@/background/activity/tracker/session.ts'

/**
 * Worker / window lifecycle hooks for bounded-loss shutdown.
 *
 *   chrome.runtime.onSuspend — last-chance callback before the service worker
 *   is unloaded. We emit a final heartbeat and kick off an async flush. The
 *   async write isn't guaranteed to land (MV3 doesn't promise it will),
 *   but combined with the 5-minute heartbeat alarm data loss stays small.
 *
 *   chrome.windows.onRemoved — when the last Chrome window closes we end
 *   the active session explicitly. Covers the Mac case where Chrome stays
 *   alive in the menu bar after closing the last window.
 */

export function handleSuspend(settingsGetter: SettingsGetter): void {
  emitHeartbeat(settingsGetter)
  // Fire-and-forget: the worker may die before this resolves. That's OK —
  // the heartbeat above already committed the active session to in-memory
  // state, which debounced flushes will eventually persist.
  void flushPendingWrites()
}

export function handleWindowRemoved(settingsGetter: SettingsGetter): void {
  chrome.windows
    .getAll()
    .then((windows) => {
      if (windows.length > 0) return
      // Last window closed. End the session explicitly so time doesn't leak
      // while Chrome lingers in the menu bar.
      endActiveSession(Date.now(), 'window_focus', settingsGetter)
      void flushPendingWrites()
    })
    .catch((err: unknown) => {
      console.warn('[activity] windows.getAll during shutdown failed', err)
    })
}

export function registerLifecycleListeners(settingsGetter: SettingsGetter): void {
  chrome.runtime.onSuspend.addListener(() => handleSuspend(settingsGetter))
  chrome.windows.onRemoved.addListener(() => handleWindowRemoved(settingsGetter))
}
