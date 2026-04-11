import type { TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'
import {
  DEFAULT_VISIBLE_STATUSES,
  getTaskSortTimestamp,
  groupTasksBySection,
  resolveVisibleStatuses,
  toggleVisibleStatus,
} from '@/widgets/Todo/utils/filter.ts'
import { describe, expect, it } from 'vitest'

function makeTask(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: 't',
    title: 'task',
    description: null,
    status: 'input',
    projectId: null,
    createdAt: 0,
    statusChangedAt: 0,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
    ...overrides,
  }
}

function s(...statuses: TodoStatus[]): ReadonlySet<TodoStatus> {
  return new Set<TodoStatus>(statuses)
}

describe('resolveVisibleStatuses', () => {
  it('returns DEFAULT_VISIBLE_STATUSES when the input set is empty', () => {
    const resolved = resolveVisibleStatuses(s())
    expect([...resolved].sort()).toEqual([...DEFAULT_VISIBLE_STATUSES].sort())
  })

  it('returns the input set unchanged when non-empty', () => {
    const input = s('completed')
    const resolved = resolveVisibleStatuses(input)
    expect(resolved).toBe(input)
  })
})

describe('toggleVisibleStatus', () => {
  it('promotes to default and removes the toggled status when starting from empty', () => {
    const next = toggleVisibleStatus(s(), 'input')
    expect([...next].sort()).toEqual(['inprogress', 'struggle'])
  })

  it('promotes to default and adds completed when toggling completed from empty', () => {
    const next = toggleVisibleStatus(s(), 'completed')
    expect([...next].sort()).toEqual(['completed', 'inprogress', 'input', 'struggle'])
  })

  it('promotes to default and adds deleted when toggling deleted from empty', () => {
    const next = toggleVisibleStatus(s(), 'deleted')
    expect([...next].sort()).toEqual(['deleted', 'inprogress', 'input', 'struggle'])
  })

  it('removes the only element when toggled from a single-element set', () => {
    const next = toggleVisibleStatus(s('input'), 'input')
    expect(next.size).toBe(0)
  })

  it('adds a new status to a non-empty set', () => {
    const next = toggleVisibleStatus(s('input'), 'inprogress')
    expect([...next].sort()).toEqual(['inprogress', 'input'])
  })

  it('adds completed to an explicit default set without re-promoting', () => {
    const next = toggleVisibleStatus(s('input', 'inprogress', 'struggle'), 'completed')
    expect([...next].sort()).toEqual(['completed', 'inprogress', 'input', 'struggle'])
  })

  it('toggle off then resolve falls back to DEFAULT_VISIBLE_STATUSES (regression for fix-filter-fallback)', () => {
    // Start from the implicit default. Walking each default status off in
    // sequence eventually drains the set; resolveVisibleStatuses must keep
    // the rendered view non-empty.
    let current: ReadonlySet<TodoStatus> = s()
    current = toggleVisibleStatus(current, 'input') // → {inprogress, struggle}
    current = toggleVisibleStatus(current, 'inprogress') // → {struggle}
    current = toggleVisibleStatus(current, 'struggle') // → {}
    expect(current.size).toBe(0)
    const resolved = resolveVisibleStatuses(current)
    expect([...resolved].sort()).toEqual([...DEFAULT_VISIBLE_STATUSES].sort())
  })
})

describe('getTaskSortTimestamp', () => {
  it('prefers statusChangedAt when present', () => {
    const task = makeTask({
      statusChangedAt: 100,
      deletedAt: 200,
      completedAt: 300,
      createdAt: 400,
    })
    expect(getTaskSortTimestamp(task)).toBe(100)
  })

  it('falls back to deletedAt when statusChangedAt is 0/null', () => {
    const task = makeTask({
      statusChangedAt: 0,
      deletedAt: 200,
      completedAt: 300,
      createdAt: 400,
    })
    expect(getTaskSortTimestamp(task)).toBe(200)
  })

  it('falls back to completedAt when statusChangedAt and deletedAt are absent', () => {
    const task = makeTask({
      statusChangedAt: 0,
      deletedAt: null,
      completedAt: 300,
      createdAt: 400,
    })
    expect(getTaskSortTimestamp(task)).toBe(300)
  })

  it('falls back to createdAt when nothing else is set', () => {
    const task = makeTask({
      statusChangedAt: 0,
      deletedAt: null,
      completedAt: null,
      createdAt: 400,
    })
    expect(getTaskSortTimestamp(task)).toBe(400)
  })
})

describe('groupTasksBySection', () => {
  it('routes tasks to the section matching their status', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'input' }),
      makeTask({ id: 'b', status: 'inprogress' }),
      makeTask({ id: 'c', status: 'struggle' }),
    ]
    const sections = groupTasksBySection(tasks, s('input', 'inprogress', 'struggle'))
    const byStatus = Object.fromEntries(
      sections.map((sec) => [sec.status, sec.tasks.map((t) => t.id)]),
    )
    expect(byStatus.input).toEqual(['a'])
    expect(byStatus.inprogress).toEqual(['b'])
    expect(byStatus.struggle).toEqual(['c'])
  })

  it('preserves the canonical TODO_STATUSES order in the returned sections', () => {
    const sections = groupTasksBySection(
      [],
      s('deleted', 'completed', 'input', 'inprogress', 'struggle'),
    )
    expect(sections.map((sec) => sec.status)).toEqual([
      'input',
      'inprogress',
      'struggle',
      'completed',
      'deleted',
    ])
  })

  it('sorts tasks inside each section descending by getTaskSortTimestamp', () => {
    const tasks = [
      makeTask({ id: 'old', statusChangedAt: 100 }),
      makeTask({ id: 'newest', statusChangedAt: 300 }),
      makeTask({ id: 'mid', statusChangedAt: 200 }),
    ]
    const [inputSection] = groupTasksBySection(tasks, s('input'))
    expect(inputSection.tasks.map((t) => t.id)).toEqual(['newest', 'mid', 'old'])
  })

  it('omits sections that are not in the visible set', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'input' }),
      makeTask({ id: 'b', status: 'completed' }),
    ]
    const sections = groupTasksBySection(tasks, s('input'))
    expect(sections.map((sec) => sec.status)).toEqual(['input'])
  })

  it('keeps empty sections in the result so the renderer decides whether to show them', () => {
    const sections = groupTasksBySection([], s('input', 'inprogress'))
    expect(sections).toEqual([
      { status: 'input', tasks: [] },
      { status: 'inprogress', tasks: [] },
    ])
  })
})
