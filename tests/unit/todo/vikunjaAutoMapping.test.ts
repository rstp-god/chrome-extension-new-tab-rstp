import { describe, expect, it } from 'vitest'

import {
  copyMappingByNames,
  flatModeMapping,
  suggestMapping,
  terminalContainer,
  validateMapping,
} from '@/widgets/Todo/integrations/vikunja/autoMapping.ts'

import type { RemoteContainer, StatusListMapping } from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaBoard } from '@/widgets/Todo/store/store.ts'

/** The board the recon instance actually has. */
const THREE_COLUMNS: RemoteContainer[] = [
  { id: '1', name: 'To-Do', isDefault: true },
  { id: '2', name: 'Doing' },
  { id: '3', name: 'Done', isTerminal: true },
]

const FULL_BOARD: RemoteContainer[] = [
  ...THREE_COLUMNS,
  { id: '4', name: 'Struggle' },
  { id: '5', name: 'Trash' },
]

const RUSSIAN_BOARD: RemoteContainer[] = [
  { id: '10', name: 'Входящие' },
  { id: '11', name: 'В работе' },
  { id: '12', name: 'Затык' },
  { id: '13', name: 'Корзина' },
  { id: '14', name: 'Готово', isTerminal: true },
]

describe('terminalContainer', () => {
  it('finds the done bucket and answers null without one', () => {
    expect(terminalContainer(THREE_COLUMNS)?.id).toBe('3')
    expect(terminalContainer([{ id: '1', name: 'To-Do' }])).toBeNull()
  })
})

describe('suggestMapping', () => {
  it('matches an English board by name', () => {
    expect(suggestMapping(FULL_BOARD)).toEqual({
      input: ['1'],
      inprogress: ['2'],
      struggle: ['4'],
      completed: ['3'],
      deleted: ['5'],
    })
  })

  it.each([
    // Word-bounded and stem-based, so an unrelated column keeps its peace.
    ['Binder', 'deleted'],
    ['Newsletter', 'input'],
    ['Combine', 'deleted'],
  ])('does not read %s as %s', (name, status) => {
    expect(suggestMapping([{ id: '1', name }])[status as 'deleted' | 'input']).toEqual([])
  })

  it.each([
    ['Удаленные', 'deleted'],
    ['Удалённые', 'deleted'],
    ['Корзина', 'deleted'],
    ['В процессе', 'inprogress'],
    ['В работе', 'inprogress'],
    ['Входящие', 'input'],
    ['Затыки', 'struggle'],
    ['Застрял', 'struggle'],
  ])('reads the Russian %s as %s', (name, status) => {
    expect(suggestMapping([{ id: '1', name }])[status as 'deleted']).toEqual(['1'])
  })

  it('is idempotent — re-suggesting over its own result changes nothing', () => {
    // The suggestion is a pure function of the containers, so a second pass
    // over the same board has to agree with the first.
    const once = suggestMapping(FULL_BOARD)
    expect(suggestMapping(FULL_BOARD)).toEqual(once)
    expect(suggestMapping([...FULL_BOARD])).toEqual(once)
  })

  it('matches a Russian board by name', () => {
    expect(suggestMapping(RUSSIAN_BOARD)).toEqual({
      input: ['10'],
      inprogress: ['11'],
      struggle: ['12'],
      completed: ['14'],
      deleted: ['13'],
    })
  })

  it('leaves struggle and deleted empty on a three-column board', () => {
    expect(suggestMapping(THREE_COLUMNS)).toEqual({
      input: ['1'],
      inprogress: ['2'],
      struggle: [],
      completed: ['3'],
      deleted: [],
    })
  })

  it('gives completed to the terminal bucket whatever it is called', () => {
    const odd: RemoteContainer[] = [
      { id: '1', name: 'Inbox' },
      { id: '9', name: 'Отгружено', isTerminal: true },
    ]
    expect(suggestMapping(odd).completed).toEqual(['9'])
  })

  it('never gives completed to a column that merely sounds finished', () => {
    const noTerminal: RemoteContainer[] = [
      { id: '1', name: 'To-Do' },
      { id: '2', name: 'Done' },
    ]
    // Without a done bucket nothing can flip `done`, so `completed` stays
    // empty rather than pointing at a column that only looks right.
    expect(suggestMapping(noTerminal).completed).toEqual([])
  })

  it('never puts one column under two statuses', () => {
    // "New backlog trash" matches input *and* deleted; the earlier status in
    // TODO_STATUSES order wins and the other row stays empty.
    const ambiguous: RemoteContainer[] = [{ id: '1', name: 'New backlog trash' }]
    const draft = suggestMapping(ambiguous)

    expect(draft.input).toEqual(['1'])
    expect(draft.deleted).toEqual([])
    expect(validateMapping(draft, ambiguous).conflicts).toEqual([])
  })

  it('ignores case and surrounding noise in a name', () => {
    const noisy: RemoteContainer[] = [
      { id: '1', name: '  BACKLOG (new) ' },
      { id: '2', name: 'WIP 🚧' },
    ]
    expect(suggestMapping(noisy)).toMatchObject({ input: ['1'], inprogress: ['2'] })
  })

  it('leaves a column nothing matched out of the draft', () => {
    const draft = suggestMapping([{ id: '7', name: 'Someday maybe' }])
    expect(Object.values(draft).flat()).toEqual([])
  })
})

describe('validateMapping', () => {
  const base: StatusListMapping = {
    input: ['1'],
    inprogress: ['2'],
    struggle: ['4'],
    completed: ['3'],
    deleted: ['5'],
  }

  it('is happy with a complete, conflict-free mapping', () => {
    expect(validateMapping(base, FULL_BOARD)).toEqual({
      conflicts: [],
      terminalMisused: [],
      completedNotTerminal: false,
      missing: [],
    })
  })

  it('reports the statuses that share a container', () => {
    const conflicting: StatusListMapping = { ...base, struggle: ['2'] }

    expect(validateMapping(conflicting, FULL_BOARD).conflicts).toEqual([['inprogress', 'struggle']])
  })

  it('reports the done bucket used as the trash', () => {
    const problems = validateMapping({ ...base, deleted: ['3'] }, FULL_BOARD)

    expect(problems.terminalMisused).toEqual(['deleted'])
    // It is also a conflict with `completed`, and both are reported.
    expect(problems.conflicts).toEqual([['completed', 'deleted']])
  })

  it('reports every non-completed status that was handed the done bucket', () => {
    // Entering the done bucket sets `done` server-side, so "in progress on
    // the done bucket" is just as broken as "trash on the done bucket".
    const problems = validateMapping(
      { ...base, inprogress: ['3'], struggle: ['3'], completed: ['4'] },
      FULL_BOARD,
    )

    expect(problems.terminalMisused).toEqual(['inprogress', 'struggle'])
    expect(problems.completedNotTerminal).toBe(true)
  })

  it('reports completed pointing somewhere other than the done bucket', () => {
    const problems = validateMapping({ ...base, completed: ['5'], deleted: ['3'] }, FULL_BOARD)

    expect(problems.completedNotTerminal).toBe(true)
  })

  it('does not complain about the terminal bucket on a board that has none', () => {
    const noTerminal = FULL_BOARD.map(({ id, name }) => ({ id, name }))
    const problems = validateMapping(base, noTerminal)

    expect(problems.completedNotTerminal).toBe(false)
    expect(problems.terminalMisused).toEqual([])
  })

  it('lists the empty rows', () => {
    expect(validateMapping({ ...base, struggle: [], deleted: [] }, THREE_COLUMNS).missing).toEqual([
      'struggle',
      'deleted',
    ])
  })

  it('reports a three-way conflict once', () => {
    const shared: StatusListMapping = { ...base, inprogress: ['1'], struggle: ['1'] }
    expect(validateMapping(shared, FULL_BOARD).conflicts).toEqual([
      ['input', 'inprogress', 'struggle'],
    ])
  })
})

describe('flatModeMapping', () => {
  it('points everything but completed at the view\u2019s default bucket', () => {
    expect(flatModeMapping(THREE_COLUMNS)).toEqual({
      input: ['1'],
      inprogress: ['1'],
      struggle: ['1'],
      completed: ['3'],
      deleted: ['1'],
    })
  })

  it('fills every row, as the persisted schema demands', () => {
    const flat = flatModeMapping(THREE_COLUMNS)
    expect(flat).not.toBeNull()
    for (const ids of Object.values(flat ?? {})) {
      expect(ids.length).toBeGreaterThan(0)
    }
  })

  it('prefers the flagged default bucket over the leftmost column', () => {
    // Vikunja drops a new task into `default_bucket_id`, and a task leaving
    // the done bucket lands there too — so that is where flat mode writes.
    const reordered: RemoteContainer[] = [
      { id: '9', name: 'Ideas' },
      { id: '1', name: 'To-Do', isDefault: true },
      { id: '3', name: 'Done', isTerminal: true },
    ]
    expect(flatModeMapping(reordered)).toMatchObject({ input: ['1'], deleted: ['1'] })
  })

  it('falls back to the leftmost non-terminal column when no default is flagged', () => {
    const unflagged: RemoteContainer[] = [
      { id: '9', name: 'Ideas' },
      { id: '3', name: 'Done', isTerminal: true },
    ]
    expect(flatModeMapping(unflagged)).toMatchObject({ input: ['9'], completed: ['3'] })
  })

  it('falls back to the terminal bucket when it is the only column', () => {
    expect(flatModeMapping([{ id: '3', name: 'Done', isTerminal: true }])).toEqual({
      input: ['3'],
      inprogress: ['3'],
      struggle: ['3'],
      completed: ['3'],
      deleted: ['3'],
    })
  })

  it('answers null without a done bucket — nothing could round-trip', () => {
    expect(flatModeMapping([{ id: '1', name: 'To-Do' }])).toBeNull()
    expect(flatModeMapping([])).toBeNull()
  })
})

describe('copyMappingByNames — carrying a mapping to a board built from the same template', () => {
  /** The board the user already mapped, with ids of its own. */
  const source: VikunjaBoard = {
    projectId: 8,
    viewId: 80,
    name: 'Work',
    containers: [
      { id: 's1', name: 'To-Do', isDefault: true },
      { id: 's2', name: 'Doing' },
      { id: 's3', name: 'Struggle' },
      { id: 's4', name: 'Done', isTerminal: true },
      { id: 's5', name: 'Trash' },
    ],
    mapping: {
      input: ['s1'],
      inprogress: ['s2'],
      struggle: ['s3'],
      completed: ['s4'],
      deleted: ['s5'],
    },
    kanbanMapping: true,
  }

  it('matches by name, ignoring case and surrounding space', () => {
    const target: RemoteContainer[] = [
      { id: 't1', name: '  to-do ', isDefault: true },
      { id: 't2', name: 'DOING' },
      { id: 't3', name: 'struggle' },
      { id: 't4', name: 'done', isTerminal: true },
      { id: 't5', name: 'Trash' },
    ]

    expect(copyMappingByNames(source, target)).toEqual({
      input: ['t1'],
      inprogress: ['t2'],
      struggle: ['t3'],
      completed: ['t4'],
      deleted: ['t5'],
    })
  })

  it('points completed at the target’s done bucket whatever either board calls it', () => {
    const target: RemoteContainer[] = [
      { id: 't1', name: 'To-Do' },
      { id: 't2', name: 'Doing' },
      { id: 't3', name: 'Struggle' },
      { id: 't9', name: 'Archive', isTerminal: true },
      { id: 't5', name: 'Trash' },
    ]

    const mapping = copyMappingByNames(source, target)

    // Nothing was called "Done" on the target board; the terminal bucket is
    // still the only honest home for `completed`.
    expect(mapping.completed).toEqual(['t9'])
    // Every other row found its column, so nothing is left for the wizard.
    expect(validateMapping(mapping, target).missing).toEqual([])
  })

  it('never carries a row onto the done bucket, even when the names agree', () => {
    // The source used "Trash" for `deleted`; on the target that very name is
    // the done bucket, and pushing a deleted task there would close it.
    const target: RemoteContainer[] = [
      { id: 't1', name: 'To-Do' },
      { id: 't2', name: 'Doing' },
      { id: 't3', name: 'Struggle' },
      { id: 't5', name: 'Trash', isTerminal: true },
    ]

    const mapping = copyMappingByNames(source, target)

    // Left empty rather than carried onto the done bucket: the wizard's own
    // validation is what reports it, and the save stays blocked.
    expect(mapping.deleted).toEqual([])
    expect(mapping.completed).toEqual(['t5'])
    expect(validateMapping(mapping, target).missing).toEqual(['deleted'])
  })

  it('reports every row the target board has no column for', () => {
    const target: RemoteContainer[] = [
      { id: 't1', name: 'To-Do', isDefault: true },
      { id: 't2', name: 'Doing' },
      { id: 't4', name: 'Done', isTerminal: true },
    ]

    const mapping = copyMappingByNames(source, target)

    expect(mapping).toEqual({
      input: ['t1'],
      inprogress: ['t2'],
      struggle: [],
      completed: ['t4'],
      deleted: [],
    })
    // The empty rows are exactly what the "create the missing columns" panel
    // then offers to build.
    expect(validateMapping(mapping, target).missing).toEqual(['struggle', 'deleted'])
  })

  it('answers an all-empty mapping for a source that was never mapped', () => {
    const target: RemoteContainer[] = [{ id: 't1', name: 'To-Do' }]
    const mapping = copyMappingByNames({ ...source, mapping: null }, target)

    expect(mapping.input).toEqual([])
    expect(validateMapping(mapping, target).missing).toEqual([
      'input',
      'inprogress',
      'struggle',
      'completed',
      'deleted',
    ])
  })
})
