import { describe, expect, it } from 'vitest'

import {
  flatModeMapping,
  suggestMapping,
  terminalContainer,
  validateMapping,
} from '@/widgets/Todo/integrations/vikunja/autoMapping.ts'

import type { RemoteContainer, StatusListMapping } from '@/widgets/Todo/integrations/types.ts'

/** The board the recon instance actually has. */
const THREE_COLUMNS: RemoteContainer[] = [
  { id: '1', name: 'To-Do' },
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
      deletedOnTerminal: false,
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

    expect(problems.deletedOnTerminal).toBe(true)
    // It is also a conflict with `completed`, and both are reported.
    expect(problems.conflicts).toEqual([['completed', 'deleted']])
  })

  it('reports completed pointing somewhere other than the done bucket', () => {
    const problems = validateMapping({ ...base, completed: ['5'], deleted: ['3'] }, FULL_BOARD)

    expect(problems.completedNotTerminal).toBe(true)
  })

  it('does not complain about the terminal bucket on a board that has none', () => {
    const noTerminal = FULL_BOARD.map(({ id, name }) => ({ id, name }))
    const problems = validateMapping(base, noTerminal)

    expect(problems.completedNotTerminal).toBe(false)
    expect(problems.deletedOnTerminal).toBe(false)
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
  it('points everything but completed at the default column', () => {
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
