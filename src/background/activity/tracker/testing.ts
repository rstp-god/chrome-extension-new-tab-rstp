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
  // Tests seed snapshots synchronously right after setupActivityTracking,
  // bypassing the async hydration path. Any events the tracker received in
  // that narrow window have landed in preHydrationEvents — drop them so
  // scripted scenarios see a clean slate.
  state.preHydrationEvents = []
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
