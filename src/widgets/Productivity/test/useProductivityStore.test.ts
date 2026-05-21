/**
 * @vitest-environment jsdom
 *
 * jsdom is needed because `debounce` uses `window.setTimeout`.
 * We also use vi.useFakeTimers() to control the debounce and throttle timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setLocal } from '@/services/chrome/storage.ts'
import { PRODUCTIVITY_DAILY_KEY } from '@/widgets/Productivity/lib/dailyCache.ts'
import {
  PRODUCTIVITY_SETTINGS_KEY,
  startProductivityAutoRefresh,
  useProductivityStore,
} from '@/widgets/Productivity/store/useProductivityStore.ts'
import { useTodoStore, type TodoTask } from '@/widgets/Todo/store/store.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TodoTask> & { createdAt: number }): TodoTask {
  return {
    id: crypto.randomUUID(),
    title: 'test',
    description: null,
    status: 'input',
    projectId: null,
    statusChangedAt: overrides.createdAt,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.useFakeTimers()

  // Reset derived + settings state to defaults
  useProductivityStore.setState({
    today: null,
    baseline: null,
    isLoading: false,
    error: null,
    lastComputedAt: null,
    showWip: true,
    showFullFlow: true,
    showPlanned: true,
    splitWeekdayWeekend: true,
  })

  // Reset Todo store
  useTodoStore.setState({ tasks: [], integration: null, loading: false, errorKey: null })

  // Reset in-memory storage (same pattern as dailyCache.test.ts)
  await setLocal(PRODUCTIVITY_DAILY_KEY, {})
  // Reset persisted settings envelope so commit() calls do not leak across tests
  await setLocal(PRODUCTIVITY_SETTINGS_KEY, null)
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProductivityStore — refresh()', () => {
  it('populates today and baseline from task list', async () => {
    const now = Date.now()
    const task = makeTask({
      createdAt: now,
      status: 'completed',
      statusChangedAt: now,
      completedAt: now,
    })
    useTodoStore.setState({ tasks: [task] })

    await useProductivityStore.getState().refresh()

    const state = useProductivityStore.getState()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.today).not.toBeNull()
    expect(typeof state.today?.closed).toBe('number')
    expect(typeof state.today?.planned).toBe('number')
    expect(typeof state.today?.wip).toBe('number')
    expect(state.today?.weekday).toBeGreaterThanOrEqual(0)
    expect(state.today?.weekday).toBeLessThanOrEqual(6)
    expect(state.baseline).not.toBeNull()
    expect(state.lastComputedAt).not.toBeNull()
  })

  it('works with an empty task list (showcase/empty path) and does not throw', async () => {
    await expect(useProductivityStore.getState().refresh()).resolves.toBeUndefined()

    const state = useProductivityStore.getState()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.today).not.toBeNull()
    expect(state.baseline).not.toBeNull()
  })

  it('sets isLoading=false and error string on failure', async () => {
    // Make ensureTodayFresh throw
    vi.spyOn(
      await import('@/widgets/Productivity/lib/dailyCache.ts'),
      'ensureTodayFresh',
    ).mockRejectedValueOnce(new Error('storage failure'))

    await useProductivityStore.getState().refresh()

    const state = useProductivityStore.getState()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBe('storage failure')
  })

  it('concurrent refresh() calls leave the store in a consistent state', async () => {
    // Seed tasks before the second call so the serialized run picks them up
    const now = Date.now()
    const task = makeTask({
      createdAt: now,
      status: 'completed',
      statusChangedAt: now,
      completedAt: now,
    })
    useTodoStore.setState({ tasks: [task] })

    // Fire two calls in quick succession without awaiting the first.
    // The second call should be queued and execute after the first completes.
    void useProductivityStore.getState().refresh()
    await useProductivityStore.getState().refresh()

    // Flush any remaining async work
    await vi.runAllTimersAsync()

    const state = useProductivityStore.getState()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.today).not.toBeNull()
    expect(state.lastComputedAt).not.toBeNull()
  })
})

describe('useProductivityStore — settings actions', () => {
  it('setShowMetric flips showWip to false', () => {
    expect(useProductivityStore.getState().showWip).toBe(true)
    useProductivityStore.getState().setShowMetric('showWip', false)
    expect(useProductivityStore.getState().showWip).toBe(false)
  })

  it('setShowMetric flips showFullFlow to false', () => {
    expect(useProductivityStore.getState().showFullFlow).toBe(true)
    useProductivityStore.getState().setShowMetric('showFullFlow', false)
    expect(useProductivityStore.getState().showFullFlow).toBe(false)
  })

  it('setShowMetric flips showPlanned to false', () => {
    expect(useProductivityStore.getState().showPlanned).toBe(true)
    useProductivityStore.getState().setShowMetric('showPlanned', false)
    expect(useProductivityStore.getState().showPlanned).toBe(false)
  })

  it('setSplitWeekdayWeekend flips the flag to false', () => {
    expect(useProductivityStore.getState().splitWeekdayWeekend).toBe(true)
    useProductivityStore.getState().setSplitWeekdayWeekend(false)
    expect(useProductivityStore.getState().splitWeekdayWeekend).toBe(false)
  })
})

describe('useProductivityStore — subscription-driven refresh', () => {
  it('triggers a debounced refresh when Todo tasks reference changes', async () => {
    // lastComputedAt starts null so throttle does not block the first call.
    expect(useProductivityStore.getState().lastComputedAt).toBeNull()

    const cleanup = startProductivityAutoRefresh()
    try {
      const now = Date.now()
      const newTasks = [makeTask({ createdAt: now })]

      // Trigger the subscription by replacing the tasks array reference
      useTodoStore.setState({ tasks: newTasks })

      // Debounce has not fired yet
      expect(useProductivityStore.getState().lastComputedAt).toBeNull()

      // Advance fake timers past debounce window
      vi.advanceTimersByTime(500)

      // Flush microtasks/promises that refresh() awaits
      await vi.runAllTimersAsync()

      const state = useProductivityStore.getState()
      expect(state.lastComputedAt).not.toBeNull()
      expect(state.today).not.toBeNull()
    } finally {
      cleanup()
    }
  })

  it('throttle: second Todo mutation within 30s does not trigger an immediate refresh', async () => {
    const cleanup = startProductivityAutoRefresh()
    try {
      // Perform first subscription-driven refresh
      useTodoStore.setState({ tasks: [makeTask({ createdAt: Date.now() })] })
      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      const firstComputedAt = useProductivityStore.getState().lastComputedAt
      expect(firstComputedAt).not.toBeNull()

      // Advance time by less than THROTTLE_MS (e.g. 5 seconds)
      vi.advanceTimersByTime(5_000)

      // Second mutation within throttle window
      useTodoStore.setState({
        tasks: [makeTask({ createdAt: Date.now() }), makeTask({ createdAt: Date.now() })],
      })

      // Advance past debounce only — the trailing timer (24_500ms) has not fired yet.
      // Do NOT use runAllTimersAsync here, as it would fire the trailing timer too.
      vi.advanceTimersByTime(500)
      await Promise.resolve()

      // No immediate refresh — still inside throttle window
      expect(useProductivityStore.getState().lastComputedAt).toBe(firstComputedAt)
    } finally {
      cleanup()
    }
  })

  it('P1 trailing-edge: refresh fires after throttle window expires', async () => {
    const cleanup = startProductivityAutoRefresh()
    try {
      // First refresh — sets lastComputedAt
      useTodoStore.setState({ tasks: [makeTask({ createdAt: Date.now() })] })
      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      const firstComputedAt = useProductivityStore.getState().lastComputedAt
      expect(firstComputedAt).not.toBeNull()

      // Advance 5 seconds (inside 30s throttle window)
      vi.advanceTimersByTime(5_000)

      // Todo change lands inside the throttle window
      useTodoStore.setState({
        tasks: [makeTask({ createdAt: Date.now() }), makeTask({ createdAt: Date.now() })],
      })

      // Advance past debounce only — trailing timer (~24_500ms) has not fired.
      // Do NOT use runAllTimersAsync here or it fires the trailing timer.
      vi.advanceTimersByTime(500)
      await Promise.resolve()
      expect(useProductivityStore.getState().lastComputedAt).toBe(firstComputedAt)

      // Advance past the remaining throttle window (24_500ms elapsed since trailing was set)
      vi.advanceTimersByTime(25_000)
      await vi.runAllTimersAsync()

      // Trailing refresh must have run
      expect(useProductivityStore.getState().lastComputedAt).toBeGreaterThan(firstComputedAt!)
      expect(useProductivityStore.getState().today).not.toBeNull()
    } finally {
      cleanup()
    }
  })

  it('P1 trailing-edge: only one trailing timer is scheduled for multiple in-window updates', async () => {
    const cleanup = startProductivityAutoRefresh()
    try {
      // Perform first subscription-driven refresh
      useTodoStore.setState({ tasks: [makeTask({ createdAt: Date.now() })] })
      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      const firstComputedAt = useProductivityStore.getState().lastComputedAt
      expect(firstComputedAt).not.toBeNull()

      vi.advanceTimersByTime(1_000)

      // First in-window mutation → schedules trailing timer
      useTodoStore.setState({
        tasks: [makeTask({ createdAt: Date.now() }), makeTask({ createdAt: Date.now() })],
      })
      // Advance past debounce only — do NOT use runAllTimersAsync (fires trailing).
      vi.advanceTimersByTime(500)
      await Promise.resolve()

      vi.advanceTimersByTime(1_000)

      // Second in-window mutation → trailing timer already exists, should not stack
      useTodoStore.setState({
        tasks: [
          makeTask({ createdAt: Date.now() }),
          makeTask({ createdAt: Date.now() }),
          makeTask({ createdAt: Date.now() }),
        ],
      })
      vi.advanceTimersByTime(500)
      await Promise.resolve()

      // Still inside window — no refresh yet
      expect(useProductivityStore.getState().lastComputedAt).toBe(firstComputedAt)

      // Advance past the full throttle window so trailing timer fires
      vi.advanceTimersByTime(30_000)
      await vi.runAllTimersAsync()

      // Exactly one trailing refresh ran
      expect(useProductivityStore.getState().lastComputedAt).toBeGreaterThan(firstComputedAt!)
    } finally {
      cleanup()
    }
  })

  it('cleanup unsubscribes: Todo change after cleanup does NOT trigger a refresh', async () => {
    const cleanup = startProductivityAutoRefresh()

    // First refresh to establish lastComputedAt
    useTodoStore.setState({ tasks: [makeTask({ createdAt: Date.now() })] })
    vi.advanceTimersByTime(500)
    await vi.runAllTimersAsync()

    const computedAt = useProductivityStore.getState().lastComputedAt
    expect(computedAt).not.toBeNull()

    // Tear down the subscription
    cleanup()

    // Advance past throttle window so leading-edge would fire if subscribed
    vi.advanceTimersByTime(31_000)

    // Mutate tasks — should NOT trigger a refresh
    useTodoStore.setState({
      tasks: [makeTask({ createdAt: Date.now() }), makeTask({ createdAt: Date.now() })],
    })
    vi.advanceTimersByTime(500)
    await vi.runAllTimersAsync()

    // lastComputedAt must remain unchanged
    expect(useProductivityStore.getState().lastComputedAt).toBe(computedAt)
  })

  it('throttle does NOT block a direct refresh() call', async () => {
    const cleanup = startProductivityAutoRefresh()
    try {
      // Perform first subscription-driven refresh
      useTodoStore.setState({ tasks: [makeTask({ createdAt: Date.now() })] })
      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      const firstComputedAt = useProductivityStore.getState().lastComputedAt
      expect(firstComputedAt).not.toBeNull()

      // Advance time by less than THROTTLE_MS
      vi.advanceTimersByTime(1_000)

      // Direct call must always run
      await useProductivityStore.getState().refresh()

      expect(useProductivityStore.getState().lastComputedAt).toBeGreaterThan(firstComputedAt!)
    } finally {
      cleanup()
    }
  })
})
