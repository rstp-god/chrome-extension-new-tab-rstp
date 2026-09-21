import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendVikunjaMessage } from '@/widgets/Todo/integrations/vikunja/bridge.ts'
import { descriptor, VikunjaIntegration } from '@/widgets/Todo/integrations/vikunja/index.ts'

import type { VikunjaProjectSummary, VikunjaPulledTask } from '@/background/vikunja/messages.ts'
import type { StatusListMapping, TodoIntegration } from '@/widgets/Todo/integrations/types.ts'
import type { IntegrationState, VikunjaBoard, VikunjaConfig } from '@/widgets/Todo/store/store.ts'

vi.mock('@/widgets/Todo/integrations/vikunja/bridge.ts', () => ({
  sendVikunjaMessage: vi.fn(),
}))

const bridge = vi.mocked(sendVikunjaMessage)

/**
 * The one board these tests sync; `SCOPE` below is its pair.
 *
 * Its buckets and mapping are deliberately non-empty: they are what a
 * `withScope` that re-points the board at another view has to drop, and an
 * empty board could not tell that apart from doing nothing.
 */
const MAPPING: StatusListMapping = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['5'],
  completed: ['3'],
  deleted: ['6'],
}

const BOARD: VikunjaBoard = {
  projectId: 1,
  viewId: 4,
  name: 'Probe',
  containers: [{ id: '1', name: 'To-Do', isDefault: true }],
  // The board's own mapping is what a pull and a push read (task 2) — the
  // store's `ctx.mapping` is the single-board field this backend dropped.
  mapping: MAPPING,
  kanbanMapping: true,
}

const CONFIG: VikunjaConfig = {
  baseUrl: 'https://vikunja.example',
  token: 'tk_super-secret-value',
  boards: [BOARD],
  defaultProjectId: 1,
}

/** The same connection before the picker added a board. */
const NO_BOARD: VikunjaConfig = { ...CONFIG, boards: [], defaultProjectId: null }

const SCOPE = { projectId: 1, viewId: 4 }

function summaryProject(overrides: Partial<VikunjaProjectSummary> = {}): VikunjaProjectSummary {
  return { id: 1, title: 'Inbox', kanbanViewId: 4, isArchived: false, ...overrides }
}

function pulledTask(overrides: Partial<VikunjaPulledTask> = {}): VikunjaPulledTask {
  return {
    id: 4,
    identifier: '#3',
    title: 'Probe',
    description: '',
    done: false,
    doneAt: null,
    bucketId: 1,
    created: '2026-09-20T17:00:00+03:00',
    updated: '2026-09-20T17:30:00+03:00',
    labelIds: [],
    ...overrides,
  }
}

beforeEach(() => {
  bridge.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('VikunjaIntegration.connect', () => {
  it('sends the credentials as a connect op and reports the token owner', async () => {
    bridge.mockResolvedValue({ ok: true, value: { userHandle: 'probe', version: 'v2.6.0' } })

    await expect(new VikunjaIntegration(CONFIG).connect()).resolves.toEqual({
      ok: true,
      value: { userHandle: 'probe' },
    })

    expect(bridge).toHaveBeenCalledWith({
      type: 'vikunja',
      op: 'connect',
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
    })
  })

  it.each(['authInvalid', 'permissionMissing', 'network', 'unknown'] as const)(
    'passes a %s failure through unchanged',
    async (errorKey) => {
      bridge.mockResolvedValue({ ok: false, errorKey })

      await expect(new VikunjaIntegration(CONFIG).connect()).resolves.toEqual({
        ok: false,
        errorKey,
      })
    },
  )

  it('rejects a payload that does not match the connect schema', async () => {
    // The bridge validates the envelope only, so a worker answering with the
    // wrong shape must not surface as a successful connection.
    bridge.mockResolvedValue({ ok: true, value: { version: 'v2.6.0' } })

    await expect(new VikunjaIntegration(CONFIG).connect()).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
  })
})

describe('VikunjaIntegration.pushTask', () => {
  const integration: TodoIntegration = new VikunjaIntegration(CONFIG)

  // The push rules themselves live in `vikunjaPush.test.ts`; this is the
  // adapter's own share of the work — resolving the board before delegating.
  it('answers mappingIncomplete when no board is picked, without a request', async () => {
    // The board carries the mode, the columns and the project a write goes
    // to, so without one there is nothing honest to push under — and the
    // scope the store passes says nothing about it any more.
    const noBoard: TodoIntegration = new VikunjaIntegration(NO_BOARD)

    await expect(
      noBoard.pushTask(
        {} as never,
        { kind: 'create' },
        { scope: null, mapping: null, knownRef: null },
      ),
    ).resolves.toEqual({ ok: false, errorKey: 'mappingIncomplete' })
    expect(bridge).not.toHaveBeenCalled()
  })

  it('sends the credentials and the scope project id with the create', async () => {
    bridge.mockResolvedValue({
      ok: true,
      value: { id: 7, identifier: '#7', bucketId: 1, done: false, doneAt: null, updated: 'now' },
    })

    await integration.pushTask(
      {
        title: 'Probe',
        description: null,
        status: 'input',
        projectId: null,
        remoteRef: null,
      } as never,
      { kind: 'create' },
      { scope: SCOPE, mapping: MAPPING, knownRef: null },
    )

    expect(bridge).toHaveBeenCalledWith({
      type: 'vikunja',
      op: 'create',
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
      projectId: 1,
      payload: { title: 'Probe', description: '' },
    })
  })

  it('disconnects without touching the bridge', () => {
    expect(() => integration.disconnect()).not.toThrow()
    expect(bridge).not.toHaveBeenCalled()
  })
})

describe('VikunjaIntegration.listScopes', () => {
  it('offers only projects that have a kanban view and are not archived', async () => {
    bridge.mockResolvedValue({
      ok: true,
      value: [
        summaryProject({ id: 1, title: 'Inbox' }),
        summaryProject({ id: 2, title: 'Archived', isArchived: true }),
        summaryProject({ id: 3, title: 'List only', kanbanViewId: null }),
      ],
    })

    await expect(new VikunjaIntegration(CONFIG).listScopes()).resolves.toEqual({
      ok: true,
      value: [{ scope: { projectId: 1, viewId: 4 }, name: 'Inbox' }],
    })
    expect(bridge).toHaveBeenCalledWith({
      type: 'vikunja',
      op: 'listProjects',
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
    })
  })

  it('rejects a payload that is not a project list', async () => {
    bridge.mockResolvedValue({ ok: true, value: [{ id: 1 }] })

    await expect(new VikunjaIntegration(CONFIG).listScopes()).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
  })

  it('passes a bridge failure through', async () => {
    bridge.mockResolvedValue({ ok: false, errorKey: 'permissionMissing' })

    await expect(new VikunjaIntegration(CONFIG).listScopes()).resolves.toEqual({
      ok: false,
      errorKey: 'permissionMissing',
    })
  })
})

describe('VikunjaIntegration.listContainers', () => {
  it('carries the terminal and default flags, and only when true', async () => {
    bridge.mockResolvedValue({
      ok: true,
      value: [
        { id: 1, title: 'To-Do', isDone: false, isDefault: true },
        { id: 2, title: 'Doing', isDone: false, isDefault: false },
        { id: 3, title: 'Done', isDone: true, isDefault: false },
      ],
    })

    const out = await new VikunjaIntegration(CONFIG).listContainers(SCOPE)

    expect(out).toEqual({
      ok: true,
      value: [
        { id: '1', name: 'To-Do', isDefault: true },
        { id: '2', name: 'Doing' },
        { id: '3', name: 'Done', isTerminal: true },
      ],
    })
    // Absent, not `false`: the persisted shape has to stay identical to what
    // the Trello-only build wrote.
    if (!out.ok) return
    expect('isTerminal' in out.value[1]).toBe(false)
    expect('isDefault' in out.value[1]).toBe(false)
    expect(bridge).toHaveBeenCalledWith({
      type: 'vikunja',
      op: 'listBuckets',
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
      projectId: 1,
      viewId: 4,
    })
  })

  it.each([
    ['a half scope', { projectId: 1 }],
    ['an unparseable half', { projectId: 1, viewId: 'kanban' }],
  ])('answers notFound for %s without asking the bridge', async (_label, scope) => {
    await expect(new VikunjaIntegration(CONFIG).listContainers(scope)).resolves.toEqual({
      ok: false,
      errorKey: 'notFound',
    })
    expect(bridge).not.toHaveBeenCalled()
  })
})

describe('VikunjaIntegration.listProjects', () => {
  const second: VikunjaBoard = { ...BOARD, projectId: 8, viewId: 21, name: 'Work' }

  it('answers with the connected boards, and asks the instance nothing', async () => {
    // A Vikunja project *is* the board, so the projects a task may name are
    // the boards themselves — cached when they were picked, which is why this
    // costs no request.
    const adapter: TodoIntegration = new VikunjaIntegration({
      ...CONFIG,
      boards: [BOARD, second],
    })

    const out = await adapter.listProjects(SCOPE)

    expect(out).toEqual({
      ok: true,
      value: [
        { id: '1', name: 'Probe', pillClassName: expect.any(String) },
        { id: '8', name: 'Work', pillClassName: expect.any(String) },
      ],
    })
    expect(bridge).not.toHaveBeenCalled()
  })

  it('paints every board a colour of its own, derived from its id', async () => {
    const out = await new VikunjaIntegration({ ...CONFIG, boards: [BOARD, second] }).listProjects()

    expect(out.ok).toBe(true)
    if (!out.ok) return
    // Stable (no cache to refresh, the same on every device) and distinct for
    // two boards created one after the other.
    expect(out.value[0].pillClassName).not.toBe(out.value[1].pillClassName)
  })

  it('answers with nothing at all for a connection with no board', async () => {
    await expect(new VikunjaIntegration(NO_BOARD).listProjects()).resolves.toEqual({
      ok: true,
      value: [],
    })
  })
})

describe('VikunjaIntegration.pullTasks', () => {
  /**
   * The context's `scope` and `mapping` are deliberately `null`: they are the
   * store's single-scope fields and this adapter reads its own board instead
   * (task 2), so passing them would hide that.
   */
  const ctx = {
    scope: null,
    mapping: null,
    knownRefs: {},
    knownStatuses: {},
  }

  /**
   * Answers a `pull` — and nothing else, so an op this adapter should no
   * longer send (the labels it used to read) fails the test that sent it.
   */
  function stubPull(tasks: unknown[]) {
    bridge.mockImplementation(async (req) => {
      if (req.op !== 'pull') throw new Error(`unexpected op ${req.op}`)
      return { ok: true, value: { tasks, pulledAt: 1 } }
    })
  }

  it.each([
    ['forwards a forced pull to the worker', true, true],
    ['sends force: false for a background refresh', false, false],
    ['defaults to the cheap answer when the caller says nothing', undefined, false],
  ])('%s', async (_label, force, expected) => {
    stubPull([])

    await new VikunjaIntegration(CONFIG).pullTasks({ ...ctx, force })

    expect(bridge).toHaveBeenCalledWith(expect.objectContaining({ op: 'pull', force: expected }))
  })

  it.each([
    ['a forced pull', true],
    ['a background refresh', false],
    ['a pull that says nothing about it', undefined],
  ])('costs exactly one message for %s', async (_label, force) => {
    stubPull([pulledTask({ labelIds: [1, 3] })])

    await new VikunjaIntegration(CONFIG).pullTasks({ ...ctx, force })

    // The labels read is gone: a task's project is the board it lives in, so
    // there is nothing to ask the instance about it — not even once.
    expect(bridge).toHaveBeenCalledTimes(1)
    expect(bridge.mock.calls[0][0]).toMatchObject({ op: 'pull' })
  })

  it.each([
    ['a forced pull', true],
    ['a background refresh', false],
  ])('gives every task the board as its project on %s', async (_label, force) => {
    stubPull([pulledTask({ labelIds: [1, 3] }), pulledTask({ id: 9, labelIds: [] })])

    const out = await new VikunjaIntegration(CONFIG).pullTasks({ ...ctx, force })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    // `BOARD.projectId` is 1, and labels say nothing about it.
    expect(out.value.tasks.map((task) => task.projectId)).toStrictEqual(['1', '1'])
  })

  it('maps every task and reports its ref', async () => {
    stubPull([pulledTask({ bucketId: 2, labelIds: [1, 3] })])

    const out = await new VikunjaIntegration(CONFIG).pullTasks(ctx)

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value.tasks).toHaveLength(1)
    expect(out.value.tasks[0]).toMatchObject({
      id: 'vikunja:4',
      title: 'Probe',
      status: 'inprogress',
      projectId: '1',
    })
    expect(out.value.refs['vikunja:4']).toMatchObject({ taskId: 4 })
  })

  it('answers mappingIncomplete for a connection with no board', async () => {
    await expect(new VikunjaIntegration(NO_BOARD).pullTasks(ctx)).resolves.toEqual({
      ok: false,
      errorKey: 'mappingIncomplete',
    })
    expect(bridge).not.toHaveBeenCalled()
  })

  it('answers mappingIncomplete for a kanban board whose wizard never finished', async () => {
    // Without a mapping there is no bucket → status rule, so every task would
    // read as `input` — a lie the pull refuses to tell.
    const unmapped = { ...CONFIG, boards: [{ ...BOARD, mapping: null }] }

    await expect(new VikunjaIntegration(unmapped).pullTasks(ctx)).resolves.toEqual({
      ok: false,
      errorKey: 'mappingIncomplete',
    })
    expect(bridge).not.toHaveBeenCalled()
  })

  it('reads the status off the board’s mapping, not the context’s', async () => {
    stubPull([pulledTask({ bucketId: 2 })])

    const out = await new VikunjaIntegration(CONFIG).pullTasks({
      ...ctx,
      // A mapping that would make bucket 2 mean something else entirely.
      mapping: { ...MAPPING, inprogress: ['9'], deleted: ['2'] },
    })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.tasks[0].status).toBe('inprogress')
  })

  it('addresses the board’s own project and view', async () => {
    stubPull([])

    await new VikunjaIntegration(CONFIG).pullTasks(ctx)

    expect(bridge).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'pull', projectId: 1, viewId: 4 }),
    )
  })

  it('keeps a locally-known intermediate status in flat mode', async () => {
    stubPull([pulledTask({ bucketId: 1 })])

    const flatConfig = { ...CONFIG, boards: [{ ...BOARD, kanbanMapping: false }] }
    const out = await new VikunjaIntegration(flatConfig).pullTasks({
      ...ctx,
      knownStatuses: { 'vikunja:4': 'struggle' },
    })

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value.tasks[0].status).toBe('struggle')
  })

  it('rejects a pull payload that does not match the schema', async () => {
    bridge.mockResolvedValue({ ok: true, value: { tasks: [{}] } })

    await expect(new VikunjaIntegration(CONFIG).pullTasks(ctx)).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
  })
})

describe('VikunjaIntegration.pullTasks — every board, not just the default one', () => {
  const ctx = { scope: null, mapping: null, knownRefs: {}, knownStatuses: {} }

  /** A second board with buckets of its own, so a mix-up would be visible. */
  const SECOND_MAPPING: StatusListMapping = {
    input: ['30'],
    inprogress: ['31'],
    struggle: ['32'],
    completed: ['33'],
    deleted: ['34'],
  }

  const SECOND: VikunjaBoard = {
    projectId: 8,
    viewId: 21,
    name: 'Work',
    containers: [],
    mapping: SECOND_MAPPING,
    kanbanMapping: true,
  }

  function multi(boards: VikunjaBoard[]): VikunjaConfig {
    return { ...CONFIG, boards, defaultProjectId: 1 }
  }

  /** Answers each board's pull from `byProject`, and refuses any other op. */
  function stubPerBoard(byProject: Record<number, unknown[]>) {
    bridge.mockImplementation(async (req) => {
      if (req.op !== 'pull') throw new Error(`unexpected op ${req.op}`)
      const tasks = byProject[req.projectId]
      if (tasks === undefined) throw new Error(`unexpected board ${req.projectId}`)
      return { ok: true, value: { tasks, pulledAt: 1 } }
    })
  }

  function pulls(): { projectId: number; viewId: number }[] {
    return bridge.mock.calls
      .map(([request]) => request)
      .filter((request) => request.op === 'pull')
      .map((request) => ({ projectId: request.projectId, viewId: request.viewId }))
  }

  it('sends one pull per board, each addressing its own project and view', async () => {
    stubPerBoard({ 1: [], 8: [] })

    await new VikunjaIntegration(multi([BOARD, SECOND])).pullTasks(ctx)

    expect(pulls()).toStrictEqual([
      { projectId: 1, viewId: 4 },
      { projectId: 8, viewId: 21 },
    ])
  })

  it('merges the tasks of every board into one result', async () => {
    stubPerBoard({ 1: [pulledTask({ id: 4 })], 8: [pulledTask({ id: 9 }), pulledTask({ id: 10 })] })

    const out = await new VikunjaIntegration(multi([BOARD, SECOND])).pullTasks(ctx)

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.tasks.map((task) => task.id)).toStrictEqual([
      'vikunja:4',
      'vikunja:9',
      'vikunja:10',
    ])
    expect(Object.keys(out.value.refs)).toStrictEqual(['vikunja:4', 'vikunja:9', 'vikunja:10'])
  })

  it('gives every task the board it was pulled from, in the task and in its ref', async () => {
    stubPerBoard({ 1: [pulledTask({ id: 4 })], 8: [pulledTask({ id: 9 })] })

    const out = await new VikunjaIntegration(multi([BOARD, SECOND])).pullTasks(ctx)

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.tasks.map((task) => task.projectId)).toStrictEqual(['1', '8'])
    // The ref is what a later push resolves its board from, so it is the half
    // that must not be shared between two boards.
    expect(out.value.refs['vikunja:4']).toMatchObject({ projectId: 1 })
    expect(out.value.refs['vikunja:9']).toMatchObject({ projectId: 8 })
  })

  it('reads each board’s status off that board’s own mapping', async () => {
    // Bucket 2 is `inprogress` on board 1 and means nothing on board 8;
    // bucket 31 is `inprogress` on board 8 and nothing on board 1.
    stubPerBoard({
      1: [pulledTask({ id: 4, bucketId: 2 })],
      8: [pulledTask({ id: 9, bucketId: 31 })],
    })

    const out = await new VikunjaIntegration(multi([BOARD, SECOND])).pullTasks(ctx)

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.tasks.map((task) => task.status)).toStrictEqual(['inprogress', 'inprogress'])
  })

  it('honours flat mode per board, not per connection', async () => {
    // Board 8 runs flat: its status comes from `done`, and the bucket the
    // task sits in says nothing — the kanban board next to it is unaffected.
    const flatBoard: VikunjaBoard = { ...SECOND, kanbanMapping: false }
    stubPerBoard({
      1: [pulledTask({ id: 4, bucketId: 2 })],
      8: [pulledTask({ id: 9, bucketId: 31, done: true })],
    })

    const out = await new VikunjaIntegration(multi([BOARD, flatBoard])).pullTasks({
      ...ctx,
      knownStatuses: {},
    })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.tasks.map((task) => task.status)).toStrictEqual(['inprogress', 'completed'])
  })

  it('forwards force to every board’s pull', async () => {
    stubPerBoard({ 1: [], 8: [] })

    await new VikunjaIntegration(multi([BOARD, SECOND])).pullTasks({ ...ctx, force: true })

    for (const [request] of bridge.mock.calls) {
      expect(request).toMatchObject({ op: 'pull', force: true })
    }
  })

  it('fails the whole pull on the first board error, and reports nothing else', async () => {
    // The store's reconcile drops an owned ref that the pull did not return,
    // so a partial answer would delete every task of the board that failed.
    // Fail-fast is the only safe shape.
    bridge.mockImplementation(async (req) => {
      if (req.op !== 'pull') throw new Error(`unexpected op ${req.op}`)
      if (req.projectId === 8) return { ok: false, errorKey: 'network' }
      return { ok: true, value: { tasks: [pulledTask({ id: 4 })], pulledAt: 1 } }
    })

    await expect(new VikunjaIntegration(multi([BOARD, SECOND])).pullTasks(ctx)).resolves.toEqual({
      ok: false,
      errorKey: 'network',
    })
  })

  it('stops at the failing board instead of reading the ones behind it', async () => {
    const third: VikunjaBoard = { ...SECOND, projectId: 12, viewId: 30 }
    bridge.mockImplementation(async (req) => {
      if (req.op !== 'pull') throw new Error(`unexpected op ${req.op}`)
      if (req.projectId === 8) return { ok: false, errorKey: 'network' }
      return { ok: true, value: { tasks: [], pulledAt: 1 } }
    })

    await new VikunjaIntegration(multi([BOARD, SECOND, third])).pullTasks(ctx)

    expect(pulls().map((pull) => pull.projectId)).toStrictEqual([1, 8])
  })

  it('skips a board whose mapping wizard was never finished', async () => {
    // `stubPerBoard` throws for a board it has no answer for, so a pull of
    // the unmapped one would fail this test rather than pass unnoticed.
    stubPerBoard({ 1: [pulledTask({ id: 4 })] })

    const out = await new VikunjaIntegration(
      multi([BOARD, { ...SECOND, mapping: null }]),
    ).pullTasks(ctx)

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(pulls()).toStrictEqual([{ projectId: 1, viewId: 4 }])
    expect(out.value.tasks.map((task) => task.projectId)).toStrictEqual(['1'])
  })

  it('answers mappingIncomplete when not one board is mapped', async () => {
    const unmapped = multi([
      { ...BOARD, mapping: null },
      { ...SECOND, mapping: null },
    ])

    await expect(new VikunjaIntegration(unmapped).pullTasks(ctx)).resolves.toEqual({
      ok: false,
      errorKey: 'mappingIncomplete',
    })
    expect(bridge).not.toHaveBeenCalled()
  })

  it('keeps a task linked through the ref it already had, whichever board it is on', async () => {
    stubPerBoard({ 1: [], 8: [pulledTask({ id: 9 })] })

    const out = await new VikunjaIntegration(multi([BOARD, SECOND])).pullTasks({
      ...ctx,
      knownRefs: {
        'local-uuid': { taskId: 9, projectId: 8, identifier: '#9', bucketId: 30, updated: 'now' },
      },
    })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    // The index of known refs is built once and shared by every board: a
    // Vikunja task id is instance-wide, so it cannot mean two tasks.
    expect(out.value.tasks[0].id).toBe('local-uuid')
  })
})

describe('VikunjaIntegration.createContainer', () => {
  it('creates a bucket and returns it as a plain container', async () => {
    bridge.mockResolvedValue({
      ok: true,
      value: { id: 25, title: 'Struggle', isDone: false, isDefault: false },
    })

    await expect(
      new VikunjaIntegration(CONFIG).createContainer(SCOPE, 'Struggle'),
    ).resolves.toEqual({ ok: true, value: { id: '25', name: 'Struggle' } })

    expect(bridge).toHaveBeenCalledWith({
      type: 'vikunja',
      op: 'createBucket',
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
      projectId: 1,
      viewId: 4,
      title: 'Struggle',
    })
  })

  it('passes a failure through', async () => {
    bridge.mockResolvedValue({ ok: false, errorKey: 'authInvalid' })

    await expect(new VikunjaIntegration(CONFIG).createContainer(SCOPE, 'Trash')).resolves.toEqual({
      ok: false,
      errorKey: 'authInvalid',
    })
  })
})

describe('vikunja descriptor', () => {
  it('registers itself under the persisted name', () => {
    expect(descriptor.name).toBe('vikunja')
    expect(descriptor.titleI18nKey).toBe('todoWidget:integrations.vikunja.title')
    expect(descriptor.descriptionI18nKey).toBe('todoWidget:integrations.vikunja.description')
  })

  it('builds a VikunjaIntegration from a persisted config', () => {
    expect(descriptor.create(CONFIG)).toBeInstanceOf(VikunjaIntegration)
  })

  describe('getScope', () => {
    it('returns the pair of the default board', () => {
      expect(descriptor.getScope(CONFIG)).toEqual({ projectId: 1, viewId: 4 })
    })

    it('follows defaultProjectId rather than the order of the list', () => {
      const second: VikunjaBoard = { ...BOARD, projectId: 8, viewId: 21 }

      expect(
        descriptor.getScope({ ...CONFIG, boards: [BOARD, second], defaultProjectId: 8 }),
      ).toEqual({ projectId: 8, viewId: 21 })
    })

    it('falls back to the first board when no default is named', () => {
      expect(descriptor.getScope({ ...CONFIG, defaultProjectId: null })).toEqual({
        projectId: 1,
        viewId: 4,
      })
    })

    it('returns null with no board — the user stays on the picker', () => {
      expect(descriptor.getScope(NO_BOARD)).toBeNull()
    })
  })

  describe('withScope', () => {
    it('adds the picked board and makes it the default one', () => {
      expect(descriptor.withScope(NO_BOARD, { projectId: 1, viewId: 4 })).toEqual({
        ...NO_BOARD,
        boards: [{ ...BOARD, name: '', containers: [], mapping: null }],
        defaultProjectId: 1,
      })
    })

    it('coerces the numeric strings a picker may hand over', () => {
      expect(descriptor.withScope(NO_BOARD, { projectId: '7', viewId: '9' })).toMatchObject({
        boards: [expect.objectContaining({ projectId: 7, viewId: 9 })],
        defaultProjectId: 7,
      })
    })

    it('appends a second board and syncs it — the user just picked it', () => {
      expect(descriptor.withScope(CONFIG, { projectId: 8, viewId: 21 })).toMatchObject({
        boards: [BOARD, expect.objectContaining({ projectId: 8, viewId: 21 })],
        defaultProjectId: 8,
      })
    })

    it('re-points a board at another view and drops its stale buckets', () => {
      expect(descriptor.withScope(CONFIG, { projectId: 1, viewId: 9 })).toMatchObject({
        // Another view has other buckets, so cached columns and a mapping
        // built from them would name ids that live somewhere else.
        boards: [{ ...BOARD, viewId: 9, containers: [], mapping: null }],
        defaultProjectId: 1,
      })
    })

    it.each([
      ['a missing half', { projectId: 1 }],
      ['an unparseable half', { projectId: 1, viewId: 'kanban' }],
      ['an empty half', { projectId: '', viewId: 4 }],
    ])('adds no board given %s — half a scope is not a board', (_label, scope) => {
      expect(descriptor.withScope(NO_BOARD, scope)).toEqual(NO_BOARD)
    })
  })

  describe('withBoardState', () => {
    it('writes name, containers and mapping into the default board', () => {
      const containers = [{ id: '7', name: 'Doing' }]

      expect(
        descriptor.withBoardState?.(CONFIG, { name: 'Work', containers, mapping: MAPPING }),
      ).toMatchObject({
        boards: [{ ...BOARD, name: 'Work', containers, mapping: MAPPING }],
      })
    })

    it('writes only the fields the patch carries', () => {
      expect(descriptor.withBoardState?.(CONFIG, { mapping: null })).toMatchObject({
        boards: [{ ...BOARD, mapping: null }],
      })
    })

    it('patches the board the default points at, not the first one', () => {
      const second: VikunjaBoard = { ...BOARD, projectId: 8, viewId: 21, name: 'Work' }
      const config = { ...CONFIG, boards: [BOARD, second], defaultProjectId: 8 }

      expect(descriptor.withBoardState?.(config, { name: 'Renamed' })).toMatchObject({
        boards: [BOARD, { ...second, name: 'Renamed' }],
      })
    })

    it('changes nothing when no board is connected', () => {
      expect(descriptor.withBoardState?.(NO_BOARD, { name: 'Work' })).toEqual(NO_BOARD)
    })
  })

  describe('getSetupStep', () => {
    /** The slice the hooks are asked about; only its config matters. */
    function slice(config: VikunjaConfig): IntegrationState {
      return {
        name: 'vikunja',
        config,
        boardName: null,
        lists: [],
        projects: [],
        mapping: null,
        lastSyncAt: null,
      }
    }

    const second: VikunjaBoard = { ...BOARD, projectId: 8, viewId: 21, name: 'Work' }
    const unmapped: VikunjaBoard = { ...second, mapping: null }

    it('asks for a board while none is picked', () => {
      expect(descriptor.getSetupStep?.(slice(NO_BOARD))).toBe('board')
    })

    it('asks for a mapping while the picked board has none', () => {
      const config = { ...CONFIG, boards: [{ ...BOARD, mapping: null }] }

      expect(descriptor.getSetupStep?.(slice(config))).toBe('mapping')
    })

    it('asks for a mapping while ANY board has none, default or not', () => {
      // The default board is mapped here; the other one is not, and a sync
      // reads every board — so the wizard is still where the user belongs.
      const config = { ...CONFIG, boards: [BOARD, unmapped], defaultProjectId: 1 }

      expect(descriptor.getSetupStep?.(slice(config))).toBe('mapping')
    })

    it('lands on the summary once every board is mapped', () => {
      const config = { ...CONFIG, boards: [BOARD, second] }

      expect(descriptor.getSetupStep?.(slice(config))).toBe('summary')
    })

    it('asks for a board for a slice that is not ours', () => {
      // Only reachable if this descriptor were resolved for another
      // integration's slice; answering defensively beats casting through it.
      expect(
        descriptor.getSetupStep?.({
          name: 'trello',
          config: { apiKey: 'k', token: 't', boardId: 'board-1' },
          boardName: 'Board',
          lists: [],
          projects: [],
          mapping: null,
          lastSyncAt: null,
        }),
      ).toBe('board')
    })
  })

  describe('projectPolicy', () => {
    it('requires a project and refuses to let the widget change it', () => {
      // A Vikunja task lives *in* a project — that is what a board is — so
      // "no project" is not a state, and moving one would mean recreating the
      // task somewhere else.
      expect(descriptor.projectPolicy?.required).toBe(true)
      expect(descriptor.projectPolicy?.changeable).toBe(false)
    })

    it('defaults to the default board, as the id `Project.id` uses', () => {
      expect(descriptor.projectPolicy?.defaultId(CONFIG)).toBe('1')
      expect(
        descriptor.projectPolicy?.defaultId({
          ...CONFIG,
          boards: [BOARD, { ...BOARD, projectId: 8, viewId: 21 }],
          defaultProjectId: 8,
        }),
      ).toBe('8')
    })

    it('names no default while no board is picked', () => {
      expect(descriptor.projectPolicy?.defaultId(NO_BOARD)).toBeNull()
    })
  })

  describe('ownsRef', () => {
    it('claims a Vikunja ref', () => {
      expect(
        descriptor.ownsRef({
          taskId: 4,
          projectId: 1,
          identifier: '#3',
          bucketId: 1,
          updated: 'now',
        }),
      ).toBe(true)
    })

    it('leaves a Trello ref alone', () => {
      expect(descriptor.ownsRef({ cardId: 'abc', shortLink: null, listId: 'l1', etag: null })).toBe(
        false,
      )
    })
  })
})
