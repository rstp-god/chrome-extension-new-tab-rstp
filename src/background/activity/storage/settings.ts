import { ACTIVITY_KEYS } from '@/background/activity/constants.ts'
import { DEFAULT_ACTIVITY_SETTINGS } from '@/background/activity/defaults.ts'
import {
  readValidated,
  withLock,
  writeEnvelope,
} from '@/background/activity/storage/internal.ts'
import type { ActivitySettings } from '@/background/activity/types.ts'
import { activitySettingsEnvelope } from '@/services/zod/activitySchemas.ts'

/** Settings I/O. `loadSettings` reseeds `DEFAULT_ACTIVITY_SETTINGS` on miss/corrupt. */

export async function loadSettings(): Promise<ActivitySettings> {
  return (
    (await readValidated(ACTIVITY_KEYS.settings, activitySettingsEnvelope)) ??
    DEFAULT_ACTIVITY_SETTINGS
  )
}

export async function saveSettings(settings: ActivitySettings): Promise<void> {
  await withLock(ACTIVITY_KEYS.settings, () =>
    writeEnvelope(ACTIVITY_KEYS.settings, settings),
  )
}
