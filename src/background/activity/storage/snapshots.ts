import { ACTIVITY_KEYS } from '@/background/activity/constants.ts'
import {
  readValidated,
  withLock,
  writeEnvelope,
} from '@/background/activity/storage/internal.ts'
import type {
  ActivityAllSnapshot,
  ActivityDaySnapshot,
  ActivityWeekSnapshot,
} from '@/background/activity/types.ts'
import {
  activityAllEnvelope,
  activityDayEnvelope,
  activityWeekEnvelope,
} from '@/services/zod/activitySchemas.ts'

/** Snapshot I/O (day / week / all). */

export async function loadDay(): Promise<ActivityDaySnapshot | null> {
  return readValidated(ACTIVITY_KEYS.day, activityDayEnvelope)
}

export async function saveDay(day: ActivityDaySnapshot): Promise<void> {
  await withLock(ACTIVITY_KEYS.day, () => writeEnvelope(ACTIVITY_KEYS.day, day))
}

export async function loadWeek(): Promise<ActivityWeekSnapshot | null> {
  return readValidated(ACTIVITY_KEYS.week, activityWeekEnvelope)
}

export async function saveWeek(week: ActivityWeekSnapshot): Promise<void> {
  await withLock(ACTIVITY_KEYS.week, () => writeEnvelope(ACTIVITY_KEYS.week, week))
}

export async function loadAll(): Promise<ActivityAllSnapshot | null> {
  return readValidated(ACTIVITY_KEYS.all, activityAllEnvelope)
}

export async function saveAll(all: ActivityAllSnapshot): Promise<void> {
  await withLock(ACTIVITY_KEYS.all, () => writeEnvelope(ACTIVITY_KEYS.all, all))
}
