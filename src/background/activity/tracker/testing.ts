import { resetState, state } from '@/background/activity/tracker/state.ts'
import type { ActiveSession } from '@/background/activity/tracker/state.ts'
import type {
  ActivityAllSnapshot,
  ActivityDaySnapshot,
  ActivityEvent,
  ActivityWeekSnapshot,
} from '@/background/activity/types.ts'

/**
 * Test-only helpers. Must not be imported by production modules — tree-shaking
 * will drop them from the prod bundle but keeping them out of `tracker.ts`
 * prevents the public API surface from leaking these.
 */

export function __resetTrackerForTests(): void {
  resetState()
}

export function __seedSnapshotsForTests(
  day: ActivityDaySnapshot,
  week: ActivityWeekSnapshot,
  all: ActivityAllSnapshot,
): void {
  state.day = day
  state.week = week
  state.all = all
}

export function __peekStateForTests(): {
  activeSession: ActiveSession | null
  pendingRaw: ActivityEvent[]
  day: ActivityDaySnapshot | null
} {
  return {
    activeSession: state.activeSession ? { ...state.activeSession } : null,
    pendingRaw: [...state.pendingRaw],
    day: state.day,
  }
}
