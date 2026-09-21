import { todoEnvelopeSchema } from '@/widgets/Todo/store/store.ts'
import { upgradePersistedState } from '@/widgets/Todo/store/upgrade.ts'
import {
  makeLegacyVikunjaEnvelope,
  makeMultiBoardVikunjaEnvelope,
  makeTrelloEnvelope,
  makeVikunjaEnvelope,
  type RawTodoEnvelope,
} from '@tests/fixtures/todoEnvelope.ts'
import { describe, expect, it } from 'vitest'

/**
 * The upgrade from the single-board Vikunja config to `boards[]`.
 *
 * Two promises are tested here, and they pull in opposite directions: an old
 * config has to come out in the new shape with nothing lost, and everything
 * else has to come out *untouched* — the same object, not a copy of it, since
 * `withChromeSync` writes back whatever a parse produces and a gratuitous
 * rewrite of somebody's Trello envelope is exactly the data risk the
 * persisted schema exists to avoid.
 */

interface VikunjaBoardShape {
  projectId: number
  viewId: number
  name: string
  containers: { id: string; name: string }[]
  mapping: Record<string, string[]> | null
  kanbanMapping: boolean
}

interface VikunjaConfigShape {
  baseUrl: string
  token: string
  boards: VikunjaBoardShape[]
  defaultProjectId: number | null
  pullPeriodMin?: number
}

function parse(raw: unknown) {
  const result = todoEnvelopeSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(`envelope was rejected: ${JSON.stringify(result.error.issues, null, 2)}`)
  }
  return result.data
}

/** The parsed Vikunja slice, or a failed test — the union is not narrowed. */
function vikunjaSlice(raw: RawTodoEnvelope) {
  const integration = parse(raw).state.integration
  if (integration?.name !== 'vikunja') throw new Error('expected the vikunja branch')
  return integration
}

describe('upgradePersistedState — what it leaves alone', () => {
  it('returns the very same object for a Trello state', () => {
    const state = makeTrelloEnvelope().state

    expect(upgradePersistedState(state)).toBe(state)
  })

  it('returns the very same object for a state already carrying boards', () => {
    const state = makeVikunjaEnvelope().state

    expect(upgradePersistedState(state)).toBe(state)
  })

  it('returns the very same object without an integration', () => {
    const state = { tasks: [], integration: null }

    expect(upgradePersistedState(state)).toBe(state)
  })

  it.each([
    ['a string', 'todo-widget'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 7],
    ['an array', [{ tasks: [] }]],
  ])('returns %s unchanged', (_label, input) => {
    expect(upgradePersistedState(input)).toBe(input)
  })

  it('leaves an integration whose config is not an object alone', () => {
    const state = { tasks: [], integration: { name: 'vikunja', config: 'tk' } }

    expect(upgradePersistedState(state)).toBe(state)
  })

  it('never mutates the state it was given', () => {
    const raw = makeLegacyVikunjaEnvelope()
    const before = JSON.stringify(raw.state)

    upgradePersistedState(raw.state)

    expect(JSON.stringify(raw.state)).toBe(before)
  })
})

describe('upgradePersistedState — the single board an old config described', () => {
  it('builds one board carrying the cached name, buckets, mapping and mode', () => {
    const raw = makeLegacyVikunjaEnvelope()
    const legacy = raw.state.integration as { lists: unknown[]; mapping: unknown }

    const config = vikunjaSlice(raw).config as VikunjaConfigShape

    expect(config.boards).toHaveLength(1)
    expect(config.boards[0]).toStrictEqual({
      projectId: 1,
      viewId: 4,
      name: 'Inbox',
      containers: legacy.lists,
      mapping: legacy.mapping,
      kanbanMapping: true,
    })
  })

  it('points defaultProjectId at that board', () => {
    const config = vikunjaSlice(makeLegacyVikunjaEnvelope()).config as VikunjaConfigShape

    expect(config.defaultProjectId).toBe(1)
  })

  it('keeps the credentials and the pull period, and drops the old scope keys', () => {
    const raw = makeLegacyVikunjaEnvelope({ pullPeriodMin: 15 })

    const config = vikunjaSlice(raw).config as VikunjaConfigShape

    expect(config.baseUrl).toBe('https://vikunja.example.com')
    expect(config.token).toBe('tk_vikunja')
    expect(config.pullPeriodMin).toBe(15)
    expect(Object.keys(config).sort()).toStrictEqual([
      'baseUrl',
      'boards',
      'defaultProjectId',
      'pullPeriodMin',
      'token',
    ])
  })

  it('leaves pullPeriodMin absent when the config never had one', () => {
    const config = vikunjaSlice(makeLegacyVikunjaEnvelope()).config as VikunjaConfigShape

    expect('pullPeriodMin' in config).toBe(false)
  })

  it('carries flat mode over as the board mode', () => {
    const raw = makeLegacyVikunjaEnvelope({ kanbanMapping: false })

    const config = vikunjaSlice(raw).config as VikunjaConfigShape

    expect(config.boards[0].kanbanMapping).toBe(false)
  })

  it('keeps the slice fields as a mirror of the board (task 2 nulls them)', () => {
    const raw = makeLegacyVikunjaEnvelope()

    const integration = vikunjaSlice(raw)
    const board = (integration.config as VikunjaConfigShape).boards[0]

    expect(integration.boardName).toBe(board.name)
    expect(integration.lists).toStrictEqual(board.containers)
    expect(integration.mapping).toStrictEqual(board.mapping)
  })

  it('tells every linked task which board it lives on', () => {
    const raw = makeLegacyVikunjaEnvelope()
    const linked = raw.state.tasks.filter((task) => task.remoteRef !== null)
    expect(linked.length).toBeGreaterThan(0)

    const tasks = parse(raw).state.tasks

    const refs = tasks.map((task) => task.remoteRef).filter((ref) => ref !== null)
    expect(refs).toHaveLength(linked.length)
    for (const ref of refs) {
      if (!('taskId' in ref)) throw new Error('expected a vikunja ref')
      expect(ref.projectId).toBe(1)
    }
  })

  it('keeps the tasks that were never pushed, and every task', () => {
    const raw = makeLegacyVikunjaEnvelope()

    const tasks = parse(raw).state.tasks

    expect(tasks.map((task) => task.id)).toStrictEqual(raw.state.tasks.map((task) => task.id))
    expect(tasks.find((task) => task.id === 'task-v-3')?.remoteRef).toBeNull()
  })

  it('leaves a ref that already knows its board alone', () => {
    const raw = makeLegacyVikunjaEnvelope()
    ;(raw.state.tasks[0].remoteRef as Record<string, unknown>).projectId = 99

    const ref = parse(raw).state.tasks[0].remoteRef
    if (!ref || !('taskId' in ref)) throw new Error('expected a vikunja ref')
    expect(ref.projectId).toBe(99)
  })
})

describe('upgradePersistedState — a connection that never picked a project', () => {
  it('produces no board and no default project', () => {
    const raw = makeLegacyVikunjaEnvelope({ projectId: null, viewId: null })

    const config = vikunjaSlice(raw).config as VikunjaConfigShape

    expect(config.boards).toStrictEqual([])
    expect(config.defaultProjectId).toBeNull()
  })

  it.each([
    ['half a scope', { projectId: 1, viewId: null }],
    ['a zero id', { projectId: 0, viewId: 4 }],
  ])('produces no board given %s', (_label, overrides) => {
    const config = vikunjaSlice(makeLegacyVikunjaEnvelope(overrides)).config as VikunjaConfigShape

    expect(config.boards).toStrictEqual([])
  })

  it('drops a ref it cannot address, and keeps every task', () => {
    const raw = makeLegacyVikunjaEnvelope({ projectId: null, viewId: null })

    const tasks = parse(raw).state.tasks

    // No board means there is no truthful `projectId` to write, so the ref
    // fails the schema and degrades through the existing `.catch(null)`.
    expect(tasks.map((task) => task.remoteRef)).toStrictEqual([null, null, null])
    expect(tasks.map((task) => task.title)).toStrictEqual(raw.state.tasks.map((task) => task.title))
  })
})

describe('todo persisted envelope — the multi-board shape', () => {
  it('round-trips two boards unchanged', () => {
    const raw = makeMultiBoardVikunjaEnvelope()

    expect(parse(raw)).toStrictEqual(raw)
  })

  it('is not touched by the upgrade', () => {
    const state = makeMultiBoardVikunjaEnvelope().state

    expect(upgradePersistedState(state)).toBe(state)
  })

  it('rejects a board with a non-positive projectId', () => {
    const raw = makeMultiBoardVikunjaEnvelope()
    const config = (raw.state.integration as { config: { boards: Record<string, unknown>[] } })
      .config
    config.boards[1].projectId = 0

    expect(todoEnvelopeSchema.safeParse(raw).success).toBe(false)
  })

  it('accepts a defaultProjectId of null — no board is the default yet', () => {
    const raw = makeMultiBoardVikunjaEnvelope()
    const config = (raw.state.integration as { config: Record<string, unknown> }).config
    config.defaultProjectId = null

    expect(todoEnvelopeSchema.safeParse(raw).success).toBe(true)
  })
})
