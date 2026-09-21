import {
  boardForProject,
  boardScopes,
  defaultBoard,
  hasUnmappedBoard,
  withDefaultBoardPatch,
} from '@/widgets/Todo/integrations/vikunja/boards.ts'
import { describe, expect, it } from 'vitest'

import type { VikunjaBoard, VikunjaConfig } from '@/widgets/Todo/store/store.ts'

/**
 * "Which board is this about?" — the question a single-board config answered
 * by itself, and the one place it is answered now.
 *
 * `defaultBoard` delegates to the bridge's `defaultVikunjaBoard`, which the
 * service worker resolves its background pull with; these tests are here so
 * the widget side of that shared rule is pinned where its callers live.
 */

const MAPPING = {
  input: ['1'],
  inprogress: ['1'],
  struggle: ['1'],
  completed: ['1'],
  deleted: ['1'],
}

function board(overrides: Partial<VikunjaBoard> = {}): VikunjaBoard {
  return {
    projectId: 1,
    viewId: 4,
    name: 'Inbox',
    containers: [{ id: '1', name: 'To-Do' }],
    mapping: null,
    kanbanMapping: true,
    ...overrides,
  }
}

function config(boards: VikunjaBoard[], defaultProjectId: number | null = null): VikunjaConfig {
  return {
    baseUrl: 'https://vikunja.example',
    token: 'tk',
    boards,
    defaultProjectId,
  }
}

describe('defaultBoard', () => {
  it('is null while no board is connected', () => {
    expect(defaultBoard(config([]))).toBeNull()
  })

  it('is the board defaultProjectId names', () => {
    const second = board({ projectId: 8, name: 'Work' })

    expect(defaultBoard(config([board(), second], 8))).toBe(second)
  })

  it('falls back to the first board when nothing is named', () => {
    const first = board()

    expect(defaultBoard(config([first, board({ projectId: 8 })]))).toBe(first)
  })

  it('falls back to the first board when the named one is gone', () => {
    const first = board()

    // A board removed from under `defaultProjectId` must not leave the widget
    // with no board at all while one is right there.
    expect(defaultBoard(config([first], 99))).toBe(first)
  })
})

describe('boardForProject', () => {
  it('finds the board with that project id', () => {
    const second = board({ projectId: 8 })

    expect(boardForProject(config([board(), second], 1), 8)).toBe(second)
  })

  it('is null for a project this config knows nothing about', () => {
    // Deliberately not the default board: the board carries the mode and the
    // columns an operation runs under, and another board's are the wrong
    // ones — see `boardForProject`.
    expect(boardForProject(config([board()], 1), 99)).toBeNull()
  })

  it('is null with no boards at all', () => {
    expect(boardForProject(config([]), 1)).toBeNull()
  })
})

describe('withDefaultBoardPatch', () => {
  it('patches only the default board', () => {
    const second = board({ projectId: 8, name: 'Work' })

    const next = withDefaultBoardPatch(config([board(), second], 8), { name: 'Renamed' })

    expect(next.boards).toStrictEqual([board(), { ...second, name: 'Renamed' }])
  })

  it('leaves the rest of the config alone', () => {
    const current = config([board()], 1)

    const next = withDefaultBoardPatch(current, { kanbanMapping: false })

    expect(next.baseUrl).toBe(current.baseUrl)
    expect(next.token).toBe(current.token)
    expect(next.defaultProjectId).toBe(1)
  })

  it('returns the config unchanged when there is no board to patch', () => {
    const current = config([])

    expect(withDefaultBoardPatch(current, { name: 'Work' })).toBe(current)
  })

  it('does not mutate the config it was given', () => {
    const current = config([board()], 1)

    withDefaultBoardPatch(current, { mapping: null, name: 'Renamed' })

    expect(current.boards[0]).toStrictEqual(board())
  })
})

describe('boardScopes', () => {
  it('lists every connected board as the pair Vikunja is addressed by', () => {
    const scopes = boardScopes(config([board(), board({ projectId: 8, viewId: 21 })]))

    // The broadcast subscriber's input: a sync reads every board, so news
    // about any of them is news.
    expect(scopes).toStrictEqual([
      { projectId: 1, viewId: 4 },
      { projectId: 8, viewId: 21 },
    ])
  })

  it('is empty while no board is connected', () => {
    expect(boardScopes(config([]))).toStrictEqual([])
  })
})

describe('hasUnmappedBoard', () => {
  it('is false with no board at all — there is nothing unfinished', () => {
    expect(hasUnmappedBoard(config([]))).toBe(false)
  })

  it('is true while any board has no mapping, default or not', () => {
    const mapped = board({ mapping: MAPPING })

    expect(hasUnmappedBoard(config([mapped, board({ projectId: 8 })], 1))).toBe(true)
  })

  it('is false once every board has one', () => {
    const mapped = board({ mapping: MAPPING })

    expect(hasUnmappedBoard(config([mapped, board({ projectId: 8, mapping: MAPPING })]))).toBe(
      false,
    )
  })
})
