/**
 * Tracker entry point — public API for the activity feature.
 *
 * Implementation is split across `./tracker/*` submodules; this file only
 * wires them together and re-exports the consumer-facing surface. See
 * `README.md` for the architecture overview and contracts.
 *
 * Test-only helpers live in `./tracker/testing.ts` — import from there in tests.
 */

import { hydrateSnapshots, type SettingsGetter } from '@/background/activity/tracker/dispatch.ts'
import { registerIdleListener } from '@/background/activity/tracker/idle.ts'
import { registerLifecycleListeners } from '@/background/activity/tracker/lifecycle.ts'
import { primeExistingTabs, registerTabListeners } from '@/background/activity/tracker/listeners.ts'
import { state } from '@/background/activity/tracker/state.ts'
import { emptyAll, emptyDay, emptyWeek } from '@/background/activity/rollup.ts'

export function setupActivityTracking(settingsGetter: SettingsGetter): void {
  if (state.initialized) return
  state.initialized = true

  // Listeners attach synchronously so no event is missed during async
  // hydration. `dispatchEvent` is gated on hydration readiness internally.
  registerTabListeners(settingsGetter)
  registerIdleListener(settingsGetter)
  registerLifecycleListeners(settingsGetter)
  void primeExistingTabs()
  void hydrateSnapshots(Date.now())
}

// --- Public API re-exports ---

export { extractDomain } from '@/background/activity/tracker/domain.ts'
export { flushPendingWrites } from '@/background/activity/tracker/dispatch.ts'
export { handleIdleStateChange } from '@/background/activity/tracker/idle.ts'
export { handleSuspend, handleWindowRemoved } from '@/background/activity/tracker/lifecycle.ts'
export { emitHeartbeat, onPauseChanged } from '@/background/activity/tracker/session.ts'
export { emptyAll, emptyDay, emptyWeek }
