import { describe, expect, it } from 'vitest'

import { aggregateDaily } from '@/widgets/Productivity/lib/aggregateDaily.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid TodoTask. All non-specified fields get safe defaults. */
function makeTask(partial: Partial<TodoTask> & { createdAt: number }): TodoTask {
  return {
    id: crypto.randomUUID(),
    title: 'test task',
    description: null,
    status: 'input',
    projectId: null,
    statusChangedAt: partial.createdAt,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
    ...partial,
  }
}

/**
 * Parse an ISO "YYYY-MM-DD" string to a Date in the LOCAL zone at midnight.
 * Only used in tests that don't pass an explicit timeZone.
 */
function localMidnight(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

/** Epoch ms for a local date + time (no timeZone arg — uses runtime local zone). */
function ts(isoDate: string, h = 0, min = 0, sec = 0, ms = 0): number {
  const [y, mo, d] = isoDate.split('-').map(Number)
  return new Date(y, mo - 1, d, h, min, sec, ms).getTime()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aggregateDaily', () => {
  // 1. Empty task list
  it('empty task list → all metrics 0, date and weekday still correct', () => {
    // 2024-01-15 is a Monday → weekday 0
    const date = localMidnight('2024-01-15')
    const result = aggregateDaily([], date)

    expect(result.planned).toBe(0)
    expect(result.closed).toBe(0)
    expect(result.fullFlow).toBe(0)
    expect(result.wip).toBe(0)
    expect(result.date).toBe('2024-01-15')
    expect(result.weekday).toBe(0) // Monday = 0
  })

  // 2. Task created and completed the same day
  it('task created and completed the same day → planned=1 closed=1 fullFlow=1 wip=0', () => {
    const day = '2024-03-10'
    const task = makeTask({
      createdAt: ts(day, 9, 0),
      status: 'completed',
      statusChangedAt: ts(day, 17, 0),
      completedAt: ts(day, 17, 0),
    })

    const result = aggregateDaily([task], localMidnight(day))

    expect(result.planned).toBe(1)
    expect(result.closed).toBe(1)
    expect(result.fullFlow).toBe(1)
    expect(result.wip).toBe(0)
  })

  // 3. Task created on day A, completed on day B
  it('task created on day A, completed on day B — correct counts for each day', () => {
    const dayA = '2024-03-10'
    const dayB = '2024-03-11'

    const task = makeTask({
      createdAt: ts(dayA, 10, 0),
      status: 'completed',
      statusChangedAt: ts(dayB, 11, 0),
      completedAt: ts(dayB, 11, 0),
    })

    const resultA = aggregateDaily([task], localMidnight(dayA))
    expect(resultA.planned).toBe(1)
    expect(resultA.closed).toBe(0)
    expect(resultA.fullFlow).toBe(0)
    // Created before end-of-day A, not terminal by end of day A → WIP
    expect(resultA.wip).toBe(1)

    const resultB = aggregateDaily([task], localMidnight(dayB))
    expect(resultB.planned).toBe(0)
    expect(resultB.closed).toBe(1)
    expect(resultB.fullFlow).toBe(0)
    // Completed (terminal) by end of day B → not WIP
    expect(resultB.wip).toBe(0)
  })

  // 4. Reopened task: status inprogress but completedAt is set to a past day
  it('reopened task counts toward closed on completion day; counts as wip after reopening', () => {
    const completionDay = '2024-03-10'
    const laterDay = '2024-03-12'

    const task = makeTask({
      createdAt: ts('2024-03-09', 8, 0),
      // Currently open (reopened after being completed)
      status: 'inprogress',
      statusChangedAt: ts(laterDay, 9, 0),
      completedAt: ts(completionDay, 15, 0),
    })

    // On completion day: closed=1 (completedAt falls within this day)
    const resultCompletion = aggregateDaily([task], localMidnight(completionDay))
    expect(resultCompletion.closed).toBe(1)

    // On a later day: task is open (status=inprogress) → wip=1
    const resultLater = aggregateDaily([task], localMidnight(laterDay))
    expect(resultLater.wip).toBe(1)
  })

  // 5. Local-midnight boundary
  it('timestamp a few ms before midnight belongs to the earlier day; a few ms after belongs to the later day', () => {
    const dayA = '2024-06-01'
    const dayB = '2024-06-02'

    // One ms before midnight → belongs to dayA
    const justBeforeMidnight = ts(dayA, 23, 59, 59, 999)
    // Exactly midnight → belongs to dayB
    const exactMidnight = ts(dayB, 0, 0, 0, 0)

    const taskBefore = makeTask({ createdAt: justBeforeMidnight })
    const taskAfter = makeTask({ createdAt: exactMidnight })

    const resultA = aggregateDaily([taskBefore, taskAfter], localMidnight(dayA))
    expect(resultA.planned).toBe(1) // only taskBefore

    const resultB = aggregateDaily([taskBefore, taskAfter], localMidnight(dayB))
    expect(resultB.planned).toBe(1) // only taskAfter
  })

  // 6. WIP reconstruction for a past day
  it("task created before the target day and still open is counted in that day's wip", () => {
    const creationDay = '2024-04-01'
    const queryDay = '2024-04-05'

    // Task created days ago, still open
    const task = makeTask({
      createdAt: ts(creationDay, 10, 0),
      status: 'input',
      statusChangedAt: ts(creationDay, 10, 0),
    })

    const result = aggregateDaily([task], localMidnight(queryDay))
    expect(result.wip).toBe(1)
    expect(result.planned).toBe(0) // not created on queryDay
  })

  // 7. weekday mapping
  it('a Sunday date maps to weekday=6, a Monday date maps to weekday=0', () => {
    // 2024-01-14 is a Sunday
    const sunday = localMidnight('2024-01-14')
    expect(aggregateDaily([], sunday).weekday).toBe(6)

    // 2024-01-15 is a Monday
    const monday = localMidnight('2024-01-15')
    expect(aggregateDaily([], monday).weekday).toBe(0)
  })

  // 8. Deleted task
  it('deleted task counts toward planned on creation day; excluded from wip on/after deletion', () => {
    const creationDay = '2024-05-01'
    const deletionDay = '2024-05-02'
    const afterDay = '2024-05-03'

    const task = makeTask({
      createdAt: ts(creationDay, 9, 0),
      status: 'deleted',
      statusChangedAt: ts(deletionDay, 10, 0),
      deletedAt: ts(deletionDay, 10, 0),
    })

    // Creation day: planned=1, wip=1 (not yet deleted by end of that day)
    const resultCreation = aggregateDaily([task], localMidnight(creationDay))
    expect(resultCreation.planned).toBe(1)
    expect(resultCreation.wip).toBe(1)

    // Deletion day: wip=0 (terminal status reached during this day)
    const resultDeletion = aggregateDaily([task], localMidnight(deletionDay))
    expect(resultDeletion.wip).toBe(0)

    // Day after deletion: still wip=0
    const resultAfter = aggregateDaily([task], localMidnight(afterDay))
    expect(resultAfter.wip).toBe(0)
  })

  // Additional: multiple tasks mixed metrics
  it('multiple tasks produce correct aggregate totals', () => {
    const day = '2024-07-15'

    const completedSameDay = makeTask({
      createdAt: ts(day, 8, 0),
      status: 'completed',
      statusChangedAt: ts(day, 16, 0),
      completedAt: ts(day, 16, 0),
    })
    const createdNotCompleted = makeTask({
      createdAt: ts(day, 9, 0),
      status: 'inprogress',
      statusChangedAt: ts(day, 9, 0),
    })
    const completedYesterday = makeTask({
      createdAt: ts('2024-07-14', 10, 0),
      status: 'completed',
      statusChangedAt: ts(day, 12, 0),
      completedAt: ts(day, 12, 0),
    })

    const result = aggregateDaily(
      [completedSameDay, createdNotCompleted, completedYesterday],
      localMidnight(day),
    )

    expect(result.planned).toBe(2) // completedSameDay + createdNotCompleted
    expect(result.closed).toBe(2) // completedSameDay + completedYesterday
    expect(result.fullFlow).toBe(1) // only completedSameDay
    expect(result.wip).toBe(1) // createdNotCompleted (still open)
  })
})
