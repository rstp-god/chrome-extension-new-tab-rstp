import { ACTIVITY_KEYS } from '@/background/activity/constants.ts'
import {
  readValidated,
  withLock,
  writeEnvelope,
} from '@/background/activity/storage/internal.ts'
import type { ActivityEvent } from '@/background/activity/types.ts'
import { activityRawEnvelope } from '@/services/zod/activitySchemas.ts'

/** Raw-event I/O. All mutations are serialized via `withLock`. */

export async function loadRaw(): Promise<ActivityEvent[]> {
  return (await readValidated(ACTIVITY_KEYS.raw, activityRawEnvelope)) ?? []
}

export async function saveRaw(events: ActivityEvent[]): Promise<void> {
  await withLock(ACTIVITY_KEYS.raw, () => writeEnvelope(ACTIVITY_KEYS.raw, events))
}

/** Append events and persist. Caller is responsible for retention pruning. */
export async function appendRaw(events: ActivityEvent[]): Promise<void> {
  await withLock(ACTIVITY_KEYS.raw, async () => {
    const current = (await readValidated(ACTIVITY_KEYS.raw, activityRawEnvelope)) ?? []
    await writeEnvelope(ACTIVITY_KEYS.raw, [...current, ...events])
  })
}

/** Keep only events newer than `olderThanMs` ago (non-inclusive). */
export async function pruneRaw(olderThanMs: number, now: number): Promise<void> {
  await withLock(ACTIVITY_KEYS.raw, async () => {
    const current = (await readValidated(ACTIVITY_KEYS.raw, activityRawEnvelope)) ?? []
    const cutoff = now - olderThanMs
    const next = current.filter((e) => e.timestamp >= cutoff)
    if (next.length !== current.length) {
      await writeEnvelope(ACTIVITY_KEYS.raw, next)
    }
  })
}
