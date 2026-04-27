/**
 * I/O boundary for the activity feature.
 *
 * Split into `./storage/*` submodules by concern; this file is a thin public
 * facade. Callers import from `@/background/activity/storage.ts` — never from
 * the submodules directly.
 *
 * Responsibilities (see `./storage/internal.ts`):
 *   - Canonical `Envelope<T>` shape so worker-written records round-trip
 *     through `withChromeSync` on the UI side.
 *   - Zod `safeParse` on every read; corrupt records dropped rather than thrown.
 *   - Per-key single-flight `withLock` around mutations so async RMW flows
 *     (appendRaw / pruneRaw) cannot interleave and lose events.
 *
 * All chrome.storage interaction for the activity feature must go through
 * this facade — the tracker and alarm handlers never touch `chrome.storage`
 * directly. Keeping I/O in one place is what lets us reason about concurrency.
 */

export {
  loadLastHeartbeatTs,
  saveLastHeartbeatTs,
} from '@/background/activity/storage/heartbeat.ts'
export { appendRaw, loadRaw, pruneRaw, saveRaw } from '@/background/activity/storage/raw.ts'
export {
  loadAll,
  loadDay,
  loadWeek,
  saveAll,
  saveDay,
  saveWeek,
} from '@/background/activity/storage/snapshots.ts'
export { loadSettings, saveSettings } from '@/background/activity/storage/settings.ts'
export { __resetForTests } from '@/background/activity/storage/internal.ts'
