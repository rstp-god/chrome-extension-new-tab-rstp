/**
 * Telling the open New Tab pages something, without caring whether anyone is
 * there to hear it.
 *
 * Its own module because both halves of the background pull send broadcasts:
 * `pull.ts` reports a view that moved (whatever started the read — an alarm,
 * a manual "Sync now" in another tab, a freshly mounted widget), and
 * `alarm.ts` reports a scheduled pull that failed. Sharing one sender keeps
 * the "nobody is listening" handling in one place.
 */

import type { VikunjaBroadcast } from '@/background/vikunja/messages.ts'

function chromeObject(): typeof chrome | null {
  return (globalThis as { chrome?: typeof chrome }).chrome ?? null
}

/**
 * Drops the rejection of a `chrome.*` promise, for the calls whose failure is
 * a normal state of the world rather than an error.
 *
 * The APIs here are also callback-style on older Chrome, where the same call
 * returns `undefined`; the thenable check covers both without pretending to
 * know which one this browser gives us.
 */
export function swallowRejection(value: unknown): void {
  if (!value || typeof (value as PromiseLike<unknown>).then !== 'function') return
  void Promise.resolve(value).catch(() => {
    // Expected: see the call sites.
  })
}

/**
 * Sends one broadcast and shrugs when nobody is listening.
 *
 * "Receiving end does not exist" is the *normal* case: the alarm fires
 * whether or not a New Tab page is open, and with no page there is no
 * listener. Swallowing it is the point — an unhandled rejection in the worker
 * would otherwise be logged on every pull of a browser whose owner has no new
 * tab open.
 */
export function broadcastVikunja(message: VikunjaBroadcast): void {
  const runtime = chromeObject()?.runtime
  if (!runtime?.sendMessage) return

  try {
    swallowRejection(runtime.sendMessage(message))
  } catch {
    // Synchronous throw from `sendMessage` (no receivers at all).
  }
}
