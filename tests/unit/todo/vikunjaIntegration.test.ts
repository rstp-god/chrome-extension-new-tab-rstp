import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendVikunjaMessage } from '@/widgets/Todo/integrations/vikunja/bridge.ts'
import { descriptor, VikunjaIntegration } from '@/widgets/Todo/integrations/vikunja/index.ts'

import type { VikunjaProjectSummary, VikunjaPulledTask } from '@/background/vikunja/messages.ts'
import type { StatusListMapping, TodoIntegration } from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaConfig } from '@/widgets/Todo/store/store.ts'

vi.mock('@/widgets/Todo/integrations/vikunja/bridge.ts', () => ({
  sendVikunjaMessage: vi.fn(),
}))

const bridge = vi.mocked(sendVikunjaMessage)

const CONFIG: VikunjaConfig = {
  baseUrl: 'https://vikunja.example',
  token: 'tk_super-secret-value',
  projectId: null,
  viewId: null,
  kanbanMapping: true,
}

const SCOPE = { projectId: 1, viewId: 4 }

const MAPPING: StatusListMapping = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['5'],
  completed: ['3'],
  deleted: ['6'],
}

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
  // adapter's own share of the work — resolving the scope before delegating.
  it('answers notFound for a scope that addresses nothing, without a request', async () => {
    await expect(
      integration.pushTask(
        {} as never,
        { kind: 'create' },
        {
          scope: { projectId: 1 },
          mapping: MAPPING,
          knownRef: null,
        },
      ),
    ).resolves.toEqual({ ok: false, errorKey: 'notFound' })
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
  it('drops the reserved labels and paints the rest', async () => {
    bridge.mockResolvedValue({
      ok: true,
      value: [
        { id: 1, title: 'energy:1', hexColor: 'efbdeb' },
        { id: 2, title: 'mood:low', hexColor: 'efbdeb' },
        { id: 3, title: 'work', hexColor: '0ead69' },
      ],
    })

    // Through the interface: labels are instance-wide, so the adapter
    // declares no scope parameter, but the store still passes one.
    const adapter: TodoIntegration = new VikunjaIntegration(CONFIG)
    const out = await adapter.listProjects(SCOPE)

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value).toEqual([
      { id: '3', name: 'work', pillClassName: expect.stringContaining('emerald') },
    ])
  })
})

describe('VikunjaIntegration.pullTasks', () => {
  const ctx = {
    scope: SCOPE,
    mapping: MAPPING,
    knownRefs: {},
    knownStatuses: {},
  }

  /** Answers `listLabels` first, then `pull` — the order the adapter asks in. */
  function stubPull(
    tasks: unknown[],
    labels: unknown[] = [{ id: 3, title: 'work', hexColor: null }],
  ) {
    bridge.mockImplementation(async (req) =>
      req.op === 'listLabels'
        ? { ok: true, value: labels }
        : {
            ok: true,
            // The worker always reports a delta alongside the tasks; the
            // adapter's schema refuses a payload without one.
            value: { tasks, pulledAt: 1, delta: { added: [], changed: [], removed: [] } },
          },
    )
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
      // Label 1 is reserved, so the project is the non-reserved one.
      projectId: '3',
    })
    expect(out.value.refs['vikunja:4']).toMatchObject({ taskId: 4 })
  })

  it('keeps a locally-known intermediate status in flat mode', async () => {
    stubPull([pulledTask({ bucketId: 1 })])

    const out = await new VikunjaIntegration({ ...CONFIG, kanbanMapping: false }).pullTasks({
      ...ctx,
      knownStatuses: { 'vikunja:4': 'struggle' },
    })

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value.tasks[0].status).toBe('struggle')
  })

  it('refuses to guess the projects when the labels cannot be read', async () => {
    // Defaulting to "every label is a project" would stamp a reserved
    // `energy:` label onto tasks — the one thing the reserved list prevents.
    bridge.mockImplementation(async (req) =>
      req.op === 'listLabels'
        ? { ok: false, errorKey: 'rateLimited' }
        : {
            ok: true,
            value: { tasks: [], pulledAt: 1, delta: { added: [], changed: [], removed: [] } },
          },
    )

    await expect(new VikunjaIntegration(CONFIG).pullTasks(ctx)).resolves.toEqual({
      ok: false,
      errorKey: 'rateLimited',
    })
    expect(bridge).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'pull' }))
  })

  it('rejects a pull payload that does not match the schema', async () => {
    bridge.mockImplementation(async (req) =>
      req.op === 'listLabels' ? { ok: true, value: [] } : { ok: true, value: { tasks: [{}] } },
    )

    await expect(new VikunjaIntegration(CONFIG).pullTasks(ctx)).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
  })

  it('answers notFound for a scope that addresses nothing', async () => {
    await expect(
      new VikunjaIntegration(CONFIG).pullTasks({ ...ctx, scope: { projectId: 1 } }),
    ).resolves.toEqual({ ok: false, errorKey: 'notFound' })
    expect(bridge).not.toHaveBeenCalled()
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
    it('returns the project/view pair once both are set', () => {
      expect(descriptor.getScope({ ...CONFIG, projectId: 1, viewId: 4 })).toEqual({
        projectId: 1,
        viewId: 4,
      })
    })

    it.each([
      ['no view', { projectId: 1, viewId: null }],
      ['no project', { projectId: null, viewId: 4 }],
      ['neither', { projectId: null, viewId: null }],
    ])('returns null with %s — half a scope addresses nothing', (_label, patch) => {
      expect(descriptor.getScope({ ...CONFIG, ...patch })).toBeNull()
    })
  })

  describe('withScope', () => {
    it('writes the pair in and keeps the rest of the config', () => {
      expect(descriptor.withScope(CONFIG, { projectId: 1, viewId: 4 })).toEqual({
        ...CONFIG,
        projectId: 1,
        viewId: 4,
      })
    })

    it('coerces the numeric strings a picker may hand over', () => {
      expect(descriptor.withScope(CONFIG, { projectId: '7', viewId: '9' })).toMatchObject({
        projectId: 7,
        viewId: 9,
      })
    })

    it.each([
      ['a missing half', { projectId: 1 }],
      ['an unparseable half', { projectId: 1, viewId: 'kanban' }],
      ['an empty half', { projectId: '', viewId: 4 }],
    ])('writes null for both halves given %s', (_label, scope) => {
      expect(descriptor.withScope(CONFIG, scope)).toMatchObject({
        projectId: null,
        viewId: null,
      })
    })
  })

  describe('ownsRef', () => {
    it('claims a Vikunja ref', () => {
      expect(descriptor.ownsRef({ taskId: 4, identifier: '#3', bucketId: 1, updated: 'now' })).toBe(
        true,
      )
    })

    it('leaves a Trello ref alone', () => {
      expect(descriptor.ownsRef({ cardId: 'abc', shortLink: null, listId: 'l1', etag: null })).toBe(
        false,
      )
    })
  })
})
