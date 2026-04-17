import type { z } from 'zod'

import type { ActivityStorageKey } from '@/background/activity/constants.ts'
import type { Envelope } from '@/services/zod/zodEnvelop.ts'

/**
 * Shared helpers for the activity storage layer: envelope read/write,
 * per-key write lock, rev counter. Not part of the public API.
 */

export const ORIGIN_ID = `bg-${crypto.randomUUID()}`

const lastRev: Record<string, number> = {}

export function nextRev(key: ActivityStorageKey): number {
  lastRev[key] = (lastRev[key] ?? 0) + 1
  return lastRev[key]
}

/**
 * Per-key single-flight lock. JS is single-threaded but `await` yields;
 * two concurrent RMW cycles on the same key can both read stale data and
 * last-writer-wins. Queueing operations per key closes that window.
 */
const writeLocks: Record<string, Promise<unknown>> = {}

export function withLock<T>(
  key: ActivityStorageKey,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = writeLocks[key] ?? Promise.resolve()
  const next = prev.then(fn, fn)
  // The chained promise is a "queue pointer" — we don't care about its value,
  // only its fulfillment. Errors in `fn` already surface to the caller via
  // `next`; swallowing here prevents a single failure from blocking the queue.
  writeLocks[key] = next.catch((err: unknown) => {
    console.warn('[activity] storage write failed (queued next op)', key, err)
  })
  return next
}

export async function readValidated<T>(
  key: ActivityStorageKey,
  schema: z.ZodType<Envelope<T>>,
): Promise<T | null> {
  try {
    const result = await chrome.storage.local.get(key)
    const raw = result[key]
    if (raw === undefined) return null
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      // Corrupt envelope: drop it rather than propagate — safer across version
      // migrations. The caller gets `null` and can reseed defaults.
      return null
    }
    // Track the highest seen rev so our next write supersedes external writes.
    if (parsed.data.meta.rev > (lastRev[key] ?? 0)) {
      lastRev[key] = parsed.data.meta.rev
    }
    return parsed.data.state
  } catch (err) {
    // chrome.storage.local.get failure (quota / disk IO) — treat as miss.
    console.warn('[activity] storage read failed for', key, err)
    return null
  }
}

export async function writeEnvelope<T>(
  key: ActivityStorageKey,
  state: T,
): Promise<void> {
  const env: Envelope<T> = {
    meta: { originId: ORIGIN_ID, rev: nextRev(key), ts: Date.now() },
    state,
  }
  await chrome.storage.local.set({ [key]: env })
}

/** Test-only: reset internal rev counters + locks between tests. */
export function __resetForTests(): void {
  for (const k of Object.keys(lastRev)) delete lastRev[k]
  for (const k of Object.keys(writeLocks)) delete writeLocks[k]
}
