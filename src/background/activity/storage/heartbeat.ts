import { ACTIVITY_KEYS } from '@/background/activity/constants.ts'
import { readValidated, withLock, writeEnvelope } from '@/background/activity/storage/internal.ts'
import { lastHeartbeatEnvelope } from '@/services/zod/activitySchemas.ts'

/**
 * Persists the wall-clock timestamp of the most recent heartbeat / session
 * end. Survives MV3 worker suspension so that on the next wake-up we can
 * recover `activeSession.startedAt` instead of restarting the clock at `now`
 * (which would lose all elapsed time between alarms).
 *
 * Also used for sleep detection: if `now - lastHeartbeatTs` exceeds the
 * threshold the heartbeat-period guarantees, we know the OS was frozen and
 * drop the would-be duration rather than emit hours of phantom activity.
 */

export async function loadLastHeartbeatTs(): Promise<number | null> {
  return await readValidated(ACTIVITY_KEYS.lastHeartbeat, lastHeartbeatEnvelope)
}

export async function saveLastHeartbeatTs(ts: number): Promise<void> {
  await withLock(ACTIVITY_KEYS.lastHeartbeat, () =>
    writeEnvelope(ACTIVITY_KEYS.lastHeartbeat, ts),
  )
}
