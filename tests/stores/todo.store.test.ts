import { beforeEach, describe, expect, it, vi } from 'vitest'

const focusOrOpenTabMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/services/chrome/tabs.ts', () => ({
  focusOrOpenTab: focusOrOpenTabMock,
}))

const removeAreaMock = vi.hoisted(() => vi.fn(async () => {}))
const setAreaMock = vi.hoisted(() =>
  // Typed rather than parameterised: the assertions read `mock.calls`, and the
  // implementation has no use for the arguments.
  vi.fn<(area: string, key: string, value: unknown) => Promise<boolean>>(async () => true),
)

// Stub the storage layer so we can assert the area-cleanup calls that keep
// Trello secrets out of storage.sync. getArea/setArea are used by the sync
// engine on import — keep them inert.
vi.mock('@/services/chrome/storage.ts', () => ({
  getArea: vi.fn(async () => null),
  setArea: setAreaMock,
  removeArea: removeAreaMock,
  getLocal: vi.fn(async () => null),
  setLocal: vi.fn(async () => true),
}))

const fakeConnect = vi.hoisted(() => vi.fn())
const fakeDisconnect = vi.hoisted(() => vi.fn())
const fakeListScopes = vi.hoisted(() => vi.fn())
const fakeListContainers = vi.hoisted(() => vi.fn())
const fakeListProjects = vi.hoisted(() => vi.fn())
const fakePullTasks = vi.hoisted(() => vi.fn())
const fakePushTask = vi.hoisted(() => vi.fn())

// Only the network-facing half is faked: `getScope` / `withScope` / `ownsRef`
// come from the real Trello descriptor, so the store is tested against the
// descriptor contract it will meet at runtime rather than a second copy of it.
vi.mock('@/widgets/Todo/integrations/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/widgets/Todo/integrations/index.ts')>()
  return {
    ...actual,
    getIntegrationDescriptor: (name: string | null | undefined) => {
      const real = actual.getIntegrationDescriptor(name)
      if (!real) return null
      return {
        ...real,
        create: () => ({
          connect: fakeConnect,
          disconnect: fakeDisconnect,
          listScopes: fakeListScopes,
          listContainers: fakeListContainers,
          listProjects: fakeListProjects,
          pullTasks: fakePullTasks,
          pushTask: fakePushTask,
        }),
      }
    },
  }
})

import { isTrelloRef } from '@/widgets/Todo/integrations/index.ts'
import type {
  IntegrationOutcome,
  Project,
  RemoteTaskRef,
  RemoteContainer,
  StatusListMapping,
  VikunjaRemoteRef,
  TrelloRemoteRef,
} from '@/widgets/Todo/integrations/index.ts'
import {
  TODO_HANDOVER_KEY,
  TODO_STORAGE_KEY,
  useTodoStore,
  type IntegrationState,
  type TodoTask,
} from '@/widgets/Todo/store/store.ts'

function makeTask(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: '1',
    title: 'Task',
    description: null,
    status: 'input',
    projectId: null,
    createdAt: 1,
    statusChangedAt: 1,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
    ...overrides,
  }
}

const mappingFixture: StatusListMapping = {
  input: ['list-input'],
  inprogress: ['list-inprogress'],
  struggle: ['list-struggle'],
  completed: ['list-completed'],
  deleted: ['list-deleted'],
}

const projectsFixture: Project[] = [
  { id: 'label-1', name: 'Feature', pillClassName: 'pill-class-1' },
]

const listsFixture: RemoteContainer[] = [
  { id: 'list-input', name: 'Inbox' },
  { id: 'list-inprogress', name: 'Doing' },
]

/** These tests drive the Trello adapter, so they build the Trello branch. */
type TrelloIntegrationState = Extract<IntegrationState, { name: 'trello' }>

/**
 * The Vikunja branch, for what is specific to it: its descriptor opts into a
 * parallel push phase, answers "is this ready to sync" from its boards, and
 * requires an unchangeable project.
 *
 * The single-board slice fields are empty, which is what the store writes for
 * this backend — everything that decides whether a sync runs is on the board.
 */
function makeVikunjaIntegrationState(
  boardOverrides: Partial<
    Extract<IntegrationState, { name: 'vikunja' }>['config']['boards'][number]
  > = {},
): Extract<IntegrationState, { name: 'vikunja' }> {
  return {
    name: 'vikunja',
    config: {
      baseUrl: 'https://vikunja.example',
      token: 'tk',
      boards: [
        {
          projectId: 1,
          viewId: 4,
          name: 'Inbox',
          containers: [{ id: '1', name: 'To-Do' }],
          mapping: mappingFixture,
          kanbanMapping: true,
          ...boardOverrides,
        },
      ],
      defaultProjectId: 1,
    },
    boardName: null,
    lists: [],
    projects: projectsFixture,
    mapping: null,
    lastSyncAt: null,
  }
}

function makeIntegrationState(
  overrides: Partial<TrelloIntegrationState> = {},
): TrelloIntegrationState {
  return {
    name: 'trello',
    config: { apiKey: 'k', token: 't', boardId: 'board-1' },
    boardName: 'Test Board',
    lists: listsFixture,
    projects: projectsFixture,
    mapping: mappingFixture,
    lastSyncAt: null,
    ...overrides,
  }
}

function ok<T>(value: T): IntegrationOutcome<T> {
  return { ok: true, value }
}

/** A ref from another backend — the Trello descriptor does not own it. */
function makeForeignRef(overrides: Partial<VikunjaRemoteRef> = {}): VikunjaRemoteRef {
  return {
    taskId: 42,
    projectId: 1,
    identifier: '#42',
    bucketId: null,
    updated: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRemoteRef(overrides: Partial<TrelloRemoteRef> = {}): TrelloRemoteRef {
  return {
    cardId: 'card-1',
    shortLink: 'sl-1',
    listId: 'list-input',
    etag: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  focusOrOpenTabMock.mockReset()
  fakeConnect.mockReset()
  fakeDisconnect.mockReset()
  fakeListScopes.mockReset()
  fakeListContainers.mockReset()
  fakeListProjects.mockReset()
  fakePullTasks.mockReset()
  fakePushTask.mockReset()
  removeAreaMock.mockClear()
  setAreaMock.mockClear()
  useTodoStore.setState({
    tasks: [],
    integration: null,
    loading: false,
    errorKey: null,
    conflictTaskIds: [],
  })
})

describe('todo store — basic CRUD', () => {
  it('adds normalized task in input status', () => {
    useTodoStore.getState().addTask({ title: '  Hello  ', description: '  world  ' })
    const task = useTodoStore.getState().tasks[0]

    expect(task.title).toBe('Hello')
    expect(task.description).toBe('world')
    expect(task.status).toBe('input')
    expect(task.projectId).toBeNull()
    expect(task.syncState).toBe('clean')
  })

  it('addTask with whitespace-only title is a no-op', () => {
    useTodoStore.getState().addTask({ title: '   ' })
    expect(useTodoStore.getState().tasks).toHaveLength(0)
  })

  it('addTask with whitespace-only description stores null', () => {
    useTodoStore.getState().addTask({ title: 'x', description: '   ' })
    expect(useTodoStore.getState().tasks[0].description).toBeNull()
  })

  it('addTask stores linkedTab when provided', () => {
    useTodoStore.getState().addTask({
      title: 'x',
      linkedTab: { url: 'https://example.com', title: 'Example' },
    })
    expect(useTodoStore.getState().tasks[0].linkedTab).toEqual({
      url: 'https://example.com',
      title: 'Example',
    })
  })

  it('addTask stores projectId when provided', () => {
    useTodoStore.getState().addTask({ title: 'x', projectId: 'label-1' })
    expect(useTodoStore.getState().tasks[0].projectId).toBe('label-1')
  })

  it('toggleTask flips between completed and input', () => {
    useTodoStore.setState({
      tasks: [makeTask({ status: 'input' })],
    })

    useTodoStore.getState().toggleTask('1')
    expect(useTodoStore.getState().tasks[0].status).toBe('completed')
    expect(useTodoStore.getState().tasks[0].completedAt).not.toBeNull()

    useTodoStore.getState().toggleTask('1')
    expect(useTodoStore.getState().tasks[0].status).toBe('input')
  })

  it('removeTask sets status to deleted and stamps deletedAt', () => {
    useTodoStore.setState({
      tasks: [makeTask()],
    })

    useTodoStore.getState().removeTask('1')
    const task = useTodoStore.getState().tasks[0]

    expect(task.status).toBe('deleted')
    expect(task.deletedAt).not.toBeNull()
  })

  it('setStatus moves the task to the requested status', () => {
    useTodoStore.setState({
      tasks: [makeTask()],
    })

    useTodoStore.getState().setStatus('1', 'inprogress')
    expect(useTodoStore.getState().tasks[0].status).toBe('inprogress')

    useTodoStore.getState().setStatus('1', 'struggle')
    expect(useTodoStore.getState().tasks[0].status).toBe('struggle')
  })

  it('setStatus to the current status is a no-op', () => {
    useTodoStore.setState({ tasks: [makeTask({ status: 'inprogress', statusChangedAt: 50 })] })
    useTodoStore.getState().setStatus('1', 'inprogress')
    expect(useTodoStore.getState().tasks[0].statusChangedAt).toBe(50)
  })

  it('setStatus to "completed" stamps completedAt and leaves deletedAt null', () => {
    useTodoStore.setState({ tasks: [makeTask()] })
    useTodoStore.getState().setStatus('1', 'completed')
    const task = useTodoStore.getState().tasks[0]
    expect(task.completedAt).not.toBeNull()
    expect(task.deletedAt).toBeNull()
  })

  it('setStatus from completed back to input keeps the historical completedAt', () => {
    useTodoStore.setState({ tasks: [makeTask({ status: 'completed', completedAt: 999 })] })
    useTodoStore.getState().setStatus('1', 'input')
    expect(useTodoStore.getState().tasks[0].completedAt).toBe(999)
  })

  it('setProject updates projectId without touching status', () => {
    useTodoStore.setState({
      tasks: [makeTask({ status: 'inprogress' })],
    })

    useTodoStore.getState().setProject('1', 'label-42')
    const task = useTodoStore.getState().tasks[0]

    expect(task.projectId).toBe('label-42')
    expect(task.status).toBe('inprogress')
  })

  it('setProject to the same value is a no-op', () => {
    useTodoStore.setState({ tasks: [makeTask({ projectId: 'label-1' })] })
    const before = useTodoStore.getState().tasks[0]
    useTodoStore.getState().setProject('1', 'label-1')
    expect(useTodoStore.getState().tasks[0]).toBe(before)
  })

  it('openOrFocusLinkedTab calls focusOrOpenTab with the task linkedTab', async () => {
    useTodoStore.setState({
      tasks: [makeTask({ linkedTab: { url: 'https://example.com', title: null } })],
    })
    await useTodoStore.getState().openOrFocusLinkedTab('1')
    expect(focusOrOpenTabMock).toHaveBeenCalledWith({
      url: 'https://example.com',
      title: null,
    })
  })

  it('openOrFocusLinkedTab is a no-op when the task has no linkedTab', async () => {
    useTodoStore.setState({ tasks: [makeTask()] })
    await useTodoStore.getState().openOrFocusLinkedTab('1')
    expect(focusOrOpenTabMock).not.toHaveBeenCalled()
  })
})

describe('todo store — integration: connect', () => {
  it('connectIntegration success populates integration with mapping=null', async () => {
    fakeConnect.mockResolvedValueOnce(ok({ userHandle: 'tester' }))
    await useTodoStore.getState().connectIntegration('trello', {
      apiKey: 'k',
      token: 't',
      boardId: null,
    })
    const state = useTodoStore.getState()
    expect(state.integration).not.toBeNull()
    expect(state.integration?.name).toBe('trello')
    expect(state.integration?.mapping).toBeNull()
    expect(state.integration?.lists).toEqual([])
    expect(state.integration?.projects).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.errorKey).toBeNull()
  })

  it('connectIntegration wipes the sync copy so tasks/secrets never linger in the cloud', async () => {
    fakeConnect.mockResolvedValueOnce(ok({ userHandle: 'tester' }))
    await useTodoStore.getState().connectIntegration('trello', {
      apiKey: 'k',
      token: 't',
      boardId: null,
    })
    expect(removeAreaMock).toHaveBeenCalledWith('sync', TODO_STORAGE_KEY)
  })

  it('connectIntegration failure sets errorKey and leaves integration null', async () => {
    fakeConnect.mockResolvedValueOnce({ ok: false, errorKey: 'authInvalid' })
    await useTodoStore.getState().connectIntegration('trello', {
      apiKey: 'k',
      token: 't',
      boardId: null,
    })
    const state = useTodoStore.getState()
    expect(state.integration).toBeNull()
    expect(state.errorKey).toBe('authInvalid')
    expect(state.loading).toBe(false)
  })

  it('connectIntegration with unknown descriptor sets errorKey="unknown" without calling adapter', async () => {
    await useTodoStore
      .getState()
      .connectIntegration('notrello', { apiKey: 'k', token: 't', boardId: null })
    expect(useTodoStore.getState().errorKey).toBe('unknown')
    expect(fakeConnect).not.toHaveBeenCalled()
  })

  it('connectIntegration rejects a config the persisted schema refuses, without any network call', async () => {
    // `token` is missing — the same parse that guards chrome.storage must
    // refuse it here, before a round-trip is spent on it.
    await useTodoStore.getState().connectIntegration('trello', { apiKey: 'k' })
    const state = useTodoStore.getState()
    expect(state.errorKey).toBe('unknown')
    expect(state.integration).toBeNull()
    expect(state.loading).toBe(false)
    expect(fakeConnect).not.toHaveBeenCalled()
  })

  it('connectIntegration strips refs the new integration does not own', async () => {
    useTodoStore.setState({
      tasks: [
        makeTask({ id: 'foreign', remoteRef: makeForeignRef(), syncState: 'dirty' }),
        makeTask({ id: 'owned', remoteRef: makeRemoteRef(), syncState: 'clean' }),
      ],
    })
    fakeConnect.mockResolvedValueOnce(ok({ userHandle: 'tester' }))
    await useTodoStore
      .getState()
      .connectIntegration('trello', { apiKey: 'k', token: 't', boardId: null })
    const tasks = useTodoStore.getState().tasks
    const foreign = tasks.find((t) => t.id === 'foreign')!
    expect(foreign.remoteRef).toBeNull()
    expect(foreign.syncState).toBe('clean')
    // Trello-owned refs survive untouched.
    expect(tasks.find((t) => t.id === 'owned')!.remoteRef).toEqual(makeRemoteRef())
  })

  it('connectIntegration toggles loading=true mid-call', async () => {
    let resolveConnect: (value: IntegrationOutcome<{ userHandle: string }>) => void = () => {}
    fakeConnect.mockImplementation(
      () =>
        new Promise<IntegrationOutcome<{ userHandle: string }>>((resolve) => {
          resolveConnect = resolve
        }),
    )
    const promise = useTodoStore.getState().connectIntegration('trello', {
      apiKey: 'k',
      token: 't',
      boardId: null,
    })
    expect(useTodoStore.getState().loading).toBe(true)
    resolveConnect(ok({ userHandle: 'tester' }))
    await promise
    expect(useTodoStore.getState().loading).toBe(false)
  })
})

describe('todo store — integration: pickScope', () => {
  it('caches scope fields AND resets mapping to null (scope-switch invalidation)', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState({ mapping: mappingFixture }),
      errorKey: 'network',
    })
    await useTodoStore
      .getState()
      .pickScope({ boardId: 'new-board' }, 'New Board', listsFixture, projectsFixture)
    const integration = useTodoStore.getState().integration
    if (integration?.name !== 'trello') throw new Error('expected the trello integration')
    expect(integration.config.boardId).toBe('new-board')
    expect(integration?.boardName).toBe('New Board')
    expect(integration?.lists).toEqual(listsFixture)
    expect(integration?.projects).toEqual(projectsFixture)
    expect(integration?.mapping).toBeNull()
    // A stale error from the previous step must not survive a successful pick.
    expect(useTodoStore.getState().errorKey).toBeNull()
  })

  it('pickScope writes the scope through the descriptor (store never touches the config shape)', async () => {
    useTodoStore.setState({ integration: makeIntegrationState() })
    await useTodoStore.getState().pickScope({ boardId: 42 }, 'Numeric', [], [])
    const integration = useTodoStore.getState().integration
    if (integration?.name !== 'trello') throw new Error('expected the trello integration')
    // `withScope` coerced the numeric scope value; credentials are preserved.
    expect(integration.config).toEqual({ apiKey: 'k', token: 't', boardId: '42' })
  })

  it('pickScope re-validates against the persisted schema and refuses an invalid slice', async () => {
    const broken = {
      ...makeIntegrationState(),
      config: { apiKey: 'k' },
    } as unknown as IntegrationState
    useTodoStore.setState({ integration: broken })
    await useTodoStore.getState().pickScope({ boardId: 'b' }, 'B', [], [])
    const state = useTodoStore.getState()
    expect(state.errorKey).toBe('unknown')
    // no partial write: the slice is left exactly as it was
    expect(state.integration).toBe(broken)
  })

  it('pickScope with no active integration is a no-op', async () => {
    await useTodoStore.getState().pickScope({ boardId: 'b' }, 'B', [], [])
    expect(useTodoStore.getState().integration).toBeNull()
  })

  it('never re-reads the projects for a backend that keeps no per-scope state', async () => {
    useTodoStore.setState({ integration: makeIntegrationState() })

    await useTodoStore
      .getState()
      .pickScope({ boardId: 'new-board' }, 'New Board', listsFixture, projectsFixture)

    // Trello's picker already read them *for that board*; asking again would
    // be a second request for the same answer.
    expect(fakeListProjects).not.toHaveBeenCalled()
  })
})

describe('todo store — integration: updateIntegrationConfig', () => {
  it('replaces the config and keeps the rest of the slice', () => {
    useTodoStore.setState({
      integration: makeIntegrationState({ mapping: mappingFixture }),
      errorKey: 'network',
    })

    useTodoStore.getState().updateIntegrationConfig({ apiKey: 'k2', token: 't2', boardId: 'b2' })

    const integration = useTodoStore.getState().integration
    if (integration?.name !== 'trello') throw new Error('expected the trello integration')
    expect(integration.config).toEqual({ apiKey: 'k2', token: 't2', boardId: 'b2' })
    // The mapping is the caller's business, not this action's.
    expect(integration.mapping).toEqual(mappingFixture)
    expect(useTodoStore.getState().errorKey).toBeNull()
  })

  it('answers whether the write happened', () => {
    useTodoStore.setState({ integration: makeIntegrationState() })

    expect(
      useTodoStore.getState().updateIntegrationConfig({ apiKey: 'k', token: 't', boardId: 'b' }),
    ).toBe(true)
    expect(useTodoStore.getState().updateIntegrationConfig({ apiKey: 'k' })).toBe(false)

    useTodoStore.setState({ integration: null })
    expect(useTodoStore.getState().updateIntegrationConfig({})).toBe(false)
  })

  it('refuses a config the persisted schema rejects, leaving the slice untouched', () => {
    const before = makeIntegrationState({ mapping: mappingFixture })
    useTodoStore.setState({ integration: before })

    useTodoStore.getState().updateIntegrationConfig({ apiKey: 'k' })

    const state = useTodoStore.getState()
    expect(state.errorKey).toBe('unknown')
    expect(state.integration).toBe(before)
  })

  it('is a no-op with no active integration', () => {
    useTodoStore.getState().updateIntegrationConfig({ apiKey: 'k', token: 't', boardId: 'b' })
    expect(useTodoStore.getState().integration).toBeNull()
  })
})

describe('todo store — integration: refreshContainers', () => {
  const refreshed: RemoteContainer[] = [...listsFixture, { id: 'list-struggle', name: 'Struggle' }]

  it('answers true on success and false on failure', async () => {
    useTodoStore.setState({ integration: makeIntegrationState({ mapping: mappingFixture }) })
    fakeListContainers.mockResolvedValueOnce(ok(refreshed))
    fakeListProjects.mockResolvedValueOnce(ok(projectsFixture))
    await expect(useTodoStore.getState().refreshContainers()).resolves.toBe(true)

    fakeListContainers.mockResolvedValueOnce({ ok: false, errorKey: 'network' })
    await expect(useTodoStore.getState().refreshContainers()).resolves.toBe(false)

    useTodoStore.setState({ integration: null })
    await expect(useTodoStore.getState().refreshContainers()).resolves.toBe(false)
  })

  it('re-reads containers and projects while keeping the mapping', async () => {
    useTodoStore.setState({ integration: makeIntegrationState({ mapping: mappingFixture }) })
    fakeListContainers.mockResolvedValueOnce(ok(refreshed))
    fakeListProjects.mockResolvedValueOnce(ok(projectsFixture))

    await useTodoStore.getState().refreshContainers()

    const state = useTodoStore.getState()
    expect(fakeListContainers).toHaveBeenCalledWith({ boardId: 'board-1' })
    expect(state.integration?.lists).toEqual(refreshed)
    expect(state.integration?.projects).toEqual(projectsFixture)
    // The whole point: unlike `pickScope`, this keeps the mapping the wizard
    // is about to save.
    expect(state.integration?.mapping).toEqual(mappingFixture)
    expect(state.loading).toBe(false)
    expect(state.errorKey).toBeNull()
  })

  it.each([
    ['the containers call', true],
    ['the projects call', false],
  ])('reports a failure of %s and changes nothing', async (_label, containersFail) => {
    const before = makeIntegrationState({ mapping: mappingFixture })
    useTodoStore.setState({ integration: before })
    const failure = { ok: false as const, errorKey: 'rateLimited' as const }
    fakeListContainers.mockResolvedValueOnce(containersFail ? failure : ok(refreshed))
    fakeListProjects.mockResolvedValueOnce(containersFail ? ok(projectsFixture) : failure)

    await useTodoStore.getState().refreshContainers()

    const state = useTodoStore.getState()
    expect(state.errorKey).toBe('rateLimited')
    expect(state.loading).toBe(false)
    expect(state.integration).toBe(before)
  })

  it('is a no-op without an integration or without a scope', async () => {
    await useTodoStore.getState().refreshContainers()
    expect(fakeListContainers).not.toHaveBeenCalled()

    useTodoStore.setState({
      integration: makeIntegrationState({ config: { apiKey: 'k', token: 't', boardId: null } }),
    })
    await useTodoStore.getState().refreshContainers()
    expect(fakeListContainers).not.toHaveBeenCalled()
  })
})

describe('todo store — integration: setMapping', () => {
  it('writes the mapping and triggers syncNow', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState({ mapping: null }),
    })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))
    await useTodoStore.getState().setMapping(mappingFixture)
    expect(useTodoStore.getState().integration?.mapping).toEqual(mappingFixture)
    expect(fakePullTasks).toHaveBeenCalledOnce()
  })

  it('setMapping with no active integration is a no-op', async () => {
    await useTodoStore.getState().setMapping(mappingFixture)
    expect(useTodoStore.getState().integration).toBeNull()
    expect(fakePullTasks).not.toHaveBeenCalled()
  })
})

describe('todo store — integration: dropTasksOfProject', () => {
  /** A Vikunja ref, which is the kind that names a project. */
  function vikunjaRef(projectId: number, taskId: number): VikunjaRemoteRef {
    return {
      taskId,
      projectId,
      identifier: `#${taskId}`,
      bucketId: null,
      updated: '2024-01-01T00:00:00.000Z',
    }
  }

  beforeEach(() => {
    useTodoStore.setState({ integration: makeVikunjaIntegrationState() })
  })

  it('forgets the tasks of that project, by the project they name and by their ref', () => {
    useTodoStore.setState({
      tasks: [
        makeTask({ id: 'named', projectId: '8' }),
        makeTask({ id: 'linked', projectId: null, remoteRef: vikunjaRef(8, 81) }),
        makeTask({ id: 'other-board', projectId: '1', remoteRef: vikunjaRef(1, 11) }),
        makeTask({ id: 'local', projectId: null }),
      ],
    })

    useTodoStore.getState().dropTasksOfProject('8')

    expect(useTodoStore.getState().tasks.map((task) => task.id)).toEqual(['other-board', 'local'])
  })

  it('clears the conflict badges of the tasks it dropped and keeps the rest', () => {
    useTodoStore.setState({
      tasks: [makeTask({ id: 'gone', projectId: '8' }), makeTask({ id: 'stays', projectId: '1' })],
      conflictTaskIds: ['gone', 'stays'],
    })

    useTodoStore.getState().dropTasksOfProject('8')

    expect(useTodoStore.getState().conflictTaskIds).toEqual(['stays'])
  })

  it('leaves a task whose ref this backend does not own', () => {
    // A Trello ref carries no project at all, and a task that merely *names*
    // another project is not this board's either.
    useTodoStore.setState({
      tasks: [makeTask({ id: 'trello', projectId: null, remoteRef: makeRemoteRef() })],
    })

    useTodoStore.getState().dropTasksOfProject('8')

    expect(useTodoStore.getState().tasks.map((task) => task.id)).toEqual(['trello'])
  })

  it('touches nothing when no task belongs to that project', () => {
    const tasks = [makeTask({ id: 'a', projectId: '1' })]
    useTodoStore.setState({ tasks })

    useTodoStore.getState().dropTasksOfProject('8')

    // The same array, so nothing re-renders for a no-op.
    expect(useTodoStore.getState().tasks).toBe(tasks)
  })
})

describe('todo store — integration: clearIntegration', () => {
  it('drops integration and clears remoteRef + syncState on every task', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        makeTask({ id: 'a', syncState: 'dirty', remoteRef: makeRemoteRef() }),
        makeTask({ id: 'b', syncState: 'error', remoteRef: makeRemoteRef({ cardId: 'card-2' }) }),
        makeTask({ id: 'c', syncState: 'clean', remoteRef: null }),
      ],
    })
    await useTodoStore.getState().clearIntegration()
    const state = useTodoStore.getState()
    expect(state.integration).toBeNull()
    for (const task of state.tasks) {
      expect(task.remoteRef).toBeNull()
      expect(task.syncState).toBe('clean')
    }
  })

  it('wipes the device-local secret copy so the integration cannot resurrect on reload', async () => {
    useTodoStore.setState({ integration: makeIntegrationState(), tasks: [] })
    removeAreaMock.mockClear()
    setAreaMock.mockClear()

    await useTodoStore.getState().clearIntegration()

    // The local envelope still holds apiKey/token; it must be removed, else
    // loadInitialEnv's "local wins" rule brings the integration back.
    expect(removeAreaMock).toHaveBeenCalledWith('local', TODO_STORAGE_KEY)
  })

  it('commits the tasks before wiping the local copy, never the other way round', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'a', remoteRef: makeRemoteRef() })],
    })
    removeAreaMock.mockClear()
    setAreaMock.mockClear()

    await useTodoStore.getState().clearIntegration()

    // `withChromeSync` answers a refused `sync` write by writing a *local*
    // envelope instead; a remove racing that fallback would delete the only
    // remaining copy of the list. So the commit has to be finished first.
    const write = setAreaMock.mock.calls.findIndex(([, key]) => key === TODO_STORAGE_KEY)
    expect(write).toBeGreaterThanOrEqual(0)
    expect(setAreaMock.mock.invocationCallOrder[write]).toBeLessThan(
      removeAreaMock.mock.invocationCallOrder[0],
    )
  })
})

describe('todo store — integration: syncNow guards', () => {
  it('syncNow without a scope sets mappingIncomplete and never calls adapter', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState({
        config: { apiKey: 'k', token: 't', boardId: null },
      }),
    })
    await useTodoStore.getState().syncNow()
    expect(useTodoStore.getState().errorKey).toBe('mappingIncomplete')
    expect(fakePushTask).not.toHaveBeenCalled()
    expect(fakePullTasks).not.toHaveBeenCalled()
  })

  it('syncNow without mapping sets mappingIncomplete and never calls adapter', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState({ mapping: null }),
    })
    await useTodoStore.getState().syncNow()
    expect(useTodoStore.getState().errorKey).toBe('mappingIncomplete')
    expect(fakePushTask).not.toHaveBeenCalled()
    expect(fakePullTasks).not.toHaveBeenCalled()
  })

  it('syncNow without active integration is a silent no-op', async () => {
    await useTodoStore.getState().syncNow()
    expect(useTodoStore.getState().errorKey).toBeNull()
    expect(fakePushTask).not.toHaveBeenCalled()
  })
})

describe('todo store — integration: syncNow options', () => {
  it('a silent sync never touches `loading` and does not force the pull', async () => {
    useTodoStore.setState({ integration: makeIntegrationState() })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))
    const seen: boolean[] = []
    const unsubscribe = useTodoStore.subscribe((state) => seen.push(state.loading))

    await useTodoStore.getState().syncNow({ silent: true })
    unsubscribe()

    // No spinner at any point: a background refresh the user never asked for
    // must not look like one they did.
    expect(seen).not.toContain(true)
    expect(useTodoStore.getState().loading).toBe(false)
    // …and the pull is answered from whatever the backend already has, which
    // for Vikunja is the snapshot the broadcast was about.
    expect(fakePullTasks).toHaveBeenCalledWith(expect.objectContaining({ force: false }))
  })

  it('a silent sync leaves a manual sync’s `loading` alone', async () => {
    useTodoStore.setState({ integration: makeIntegrationState(), loading: true })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow({ silent: true })

    expect(useTodoStore.getState().loading).toBe(true)
  })

  it('a plain syncNow keeps its spinner and forces the pull', async () => {
    useTodoStore.setState({ integration: makeIntegrationState() })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))
    const seen: boolean[] = []
    const unsubscribe = useTodoStore.subscribe((state) => seen.push(state.loading))

    await useTodoStore.getState().syncNow()
    unsubscribe()

    expect(seen).toContain(true)
    expect(useTodoStore.getState().loading).toBe(false)
    expect(fakePullTasks).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
  })

  it('a silent sync that fails still sets the error key', async () => {
    useTodoStore.setState({ integration: makeIntegrationState() })
    fakePullTasks.mockResolvedValueOnce({ ok: false, errorKey: 'authInvalid' })

    await useTodoStore.getState().syncNow({ silent: true })

    // Silence is about the spinner, not about swallowing the outcome: a
    // background refresh that stopped working is exactly what the user needs
    // to be told.
    expect(useTodoStore.getState().errorKey).toBe('authInvalid')
    expect(useTodoStore.getState().loading).toBe(false)
  })

  it('a silent sync clears a stale error when it succeeds', async () => {
    useTodoStore.setState({ integration: makeIntegrationState(), errorKey: 'network' })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow({ silent: true })

    expect(useTodoStore.getState().errorKey).toBeNull()
  })

  it('lets `force` be set independently of `silent`', async () => {
    useTodoStore.setState({ integration: makeIntegrationState() })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow({ silent: true, force: true })

    expect(fakePullTasks).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
  })
})

describe('todo store — reportRemoteFailure', () => {
  it('sets the error key without spinning', () => {
    useTodoStore.setState({ integration: makeIntegrationState() })

    useTodoStore.getState().reportRemoteFailure('authInvalid')

    expect(useTodoStore.getState().errorKey).toBe('authInvalid')
    expect(useTodoStore.getState().loading).toBe(false)
  })

  it('ignores a failure that arrives after the integration was dropped', () => {
    useTodoStore.setState({ integration: null })

    useTodoStore.getState().reportRemoteFailure('permissionMissing')

    expect(useTodoStore.getState().errorKey).toBeNull()
  })
})

describe('todo store — integration: syncNow Phase 1 (push)', () => {
  it('pushes only dirty or remoteRef-less tasks; clean+synced tasks are skipped', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        makeTask({ id: 'clean-synced', syncState: 'clean', remoteRef: makeRemoteRef() }),
        makeTask({
          id: 'dirty',
          syncState: 'dirty',
          remoteRef: makeRemoteRef({ cardId: 'card-d' }),
        }),
        makeTask({ id: 'no-ref', syncState: 'clean', remoteRef: null }),
      ],
    })
    fakePushTask.mockResolvedValue(ok(makeRemoteRef({ cardId: 'pushed' })))
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))
    await useTodoStore.getState().syncNow()
    expect(fakePushTask).toHaveBeenCalledTimes(2)
    const pushedIds = fakePushTask.mock.calls.map((c) => (c[0] as TodoTask).id).sort()
    expect(pushedIds).toEqual(['dirty', 'no-ref'])
  })

  it('on push success updates remoteRef and marks task clean', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'dirty', syncState: 'dirty', remoteRef: null })],
    })
    const pushedRef = makeRemoteRef({ cardId: 'newly-created' })
    fakePushTask.mockResolvedValueOnce(ok(pushedRef))
    // Pull must echo the task back, otherwise reconcile drops it (the
    // current "deleted-on-remote silently disappears" behavior pinned in
    // tests/unit/todo/trelloIntegration.test.ts).
    fakePullTasks.mockResolvedValueOnce(
      ok({
        tasks: [makeTask({ id: 'dirty', syncState: 'clean', remoteRef: pushedRef })],
        refs: { dirty: pushedRef },
      }),
    )
    await useTodoStore.getState().syncNow()
    const task = useTodoStore.getState().tasks.find((t) => t.id === 'dirty')!
    expect(task.remoteRef).toEqual(pushedRef)
    expect(task.syncState).toBe('clean')
  })

  it('on push failure sets errorKey, clears loading, and never calls pullTasks', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'dirty', syncState: 'dirty', remoteRef: null })],
    })
    fakePushTask.mockResolvedValueOnce({ ok: false, errorKey: 'rateLimited' })
    await useTodoStore.getState().syncNow()
    expect(useTodoStore.getState().errorKey).toBe('rateLimited')
    expect(useTodoStore.getState().loading).toBe(false)
    expect(fakePullTasks).not.toHaveBeenCalled()
  })
})

describe('todo store — integration: syncNow Phase 2 (pull + reconcile)', () => {
  it('preserves linkedTab on tasks matched by id during reconcile', async () => {
    const localLinkedTab = { url: 'https://local-tab.example', title: 'Local' }
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'matched', remoteRef: makeRemoteRef(), linkedTab: localLinkedTab })],
    })
    fakePullTasks.mockResolvedValueOnce(
      ok({
        tasks: [
          makeTask({
            id: 'matched',
            remoteRef: makeRemoteRef({ cardId: 'card-1', etag: 'updated' }),
            linkedTab: null,
            syncState: 'clean',
          }),
        ],
        refs: {},
      }),
    )
    await useTodoStore.getState().syncNow()
    const task = useTodoStore.getState().tasks.find((t) => t.id === 'matched')!
    expect(task.linkedTab).toEqual(localLinkedTab)
    const ref = task.remoteRef
    if (!ref || !isTrelloRef(ref)) throw new Error('expected a trello ref')
    expect(ref.etag).toBe('updated')
  })

  it('keeps a locally-dirty task dirty even when matched by remote pull', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'dirty-local', remoteRef: makeRemoteRef(), syncState: 'dirty' })],
    })
    // Phase 1 pushes the dirty task; mock both push success AND pull.
    fakePushTask.mockResolvedValueOnce(ok(makeRemoteRef({ cardId: 'card-1' })))
    fakePullTasks.mockResolvedValueOnce(
      ok({
        tasks: [makeTask({ id: 'dirty-local', remoteRef: makeRemoteRef(), syncState: 'clean' })],
        refs: {},
      }),
    )
    // After push, task is clean — mutate to dirty before pull resolves to
    // verify the reconcile branch directly. Easier: skip push by seeding
    // task as already-clean+synced and only test reconcile.
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'dirty-local', remoteRef: makeRemoteRef(), syncState: 'dirty' })],
    })
    fakePushTask.mockReset()
    fakePushTask.mockResolvedValueOnce(ok(makeRemoteRef()))
    // Important: after Phase 1 push the local syncState becomes 'clean',
    // so this case is not actually reachable via the normal flow. The
    // reconcile branch only protects against a race where another action
    // dirtied the task between Phase 1 and Phase 2 — but since the test
    // is single-threaded and Phase 2 reads from get().tasks after Phase 1,
    // we directly assert the reconcile logic preserves a dirty syncState
    // when one is present at reconcile time. To do that we mutate the
    // store inside the pullTasks mock implementation.
    fakePullTasks.mockReset()
    fakePullTasks.mockImplementation(async () => {
      // Race-window simulation: dirty the local task before reconcile reads it.
      useTodoStore.setState((current) => ({
        tasks: current.tasks.map((t) =>
          t.id === 'dirty-local' ? { ...t, syncState: 'dirty' as const } : t,
        ),
      }))
      return ok({
        tasks: [makeTask({ id: 'dirty-local', remoteRef: makeRemoteRef(), syncState: 'clean' })],
        refs: {},
      })
    })
    await useTodoStore.getState().syncNow()
    const task = useTodoStore.getState().tasks.find((t) => t.id === 'dirty-local')!
    expect(task.syncState).toBe('dirty')
  })

  it('keeps purely-local tasks (no remoteRef) when they are absent from the pull result', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        makeTask({ id: 'remote', remoteRef: makeRemoteRef() }),
        makeTask({ id: 'local-only', remoteRef: null, syncState: 'clean' }),
      ],
    })
    // Phase 1 will push 'local-only' (no remoteRef) — mock that
    fakePushTask.mockResolvedValueOnce(ok(makeRemoteRef({ cardId: 'now-remote' })))
    fakePullTasks.mockResolvedValueOnce(
      ok({
        tasks: [makeTask({ id: 'remote', remoteRef: makeRemoteRef(), syncState: 'clean' })],
        refs: {},
      }),
    )
    // After push, 'local-only' has a remoteRef so it's no longer "purely local".
    // Test the actual purely-local protection by seeding a task that survives
    // Phase 1 (clean + remoteRef=null is impossible to skip — only way is to
    // bypass Phase 1 by stubbing push. Re-seed.)
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        makeTask({ id: 'remote', remoteRef: makeRemoteRef() }),
        makeTask({ id: 'local-only', remoteRef: null, syncState: 'clean' }),
      ],
    })
    fakePushTask.mockReset()
    fakePushTask.mockImplementation(async () => {
      // Don't update remoteRef — simulate a stub. Actually the store applies
      // the returned ref unconditionally on success, so to keep the local
      // task purely-local we make push fail. But push failure aborts sync.
      // The cleanest way: directly read the reconcile loop by ensuring the
      // pull result has a remote-only id and the local list has another id.
      return ok(makeRemoteRef())
    })
    // Bypass Phase 1 by removing the local-only task before the iterator
    // captures it. That happens at the top of syncNow via state.tasks
    // closed-over reference. Phase 2 then reads get().tasks, where we re-add
    // a different purely-local task.
    fakePullTasks.mockReset()
    fakePullTasks.mockImplementation(async () => {
      useTodoStore.setState((current) => ({
        tasks: [
          ...current.tasks,
          makeTask({ id: 'in-flight-local', remoteRef: null, syncState: 'clean' }),
        ],
      }))
      return ok({
        tasks: [makeTask({ id: 'remote', remoteRef: makeRemoteRef(), syncState: 'clean' })],
        refs: {},
      })
    })
    await useTodoStore.getState().syncNow()
    const ids = useTodoStore
      .getState()
      .tasks.map((t) => t.id)
      .sort()
    expect(ids).toContain('in-flight-local')
    expect(ids).toContain('remote')
  })

  it('keeps a task whose ref belongs to another backend, but drops an owned one that vanished', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        // Not addressable by this descriptor, so the pull could never have
        // mentioned it — dropping it would be data loss.
        makeTask({ id: 'foreign-ref', remoteRef: makeForeignRef(), syncState: 'clean' }),
        // Owned ref + absent from the pull = deleted on the remote.
        makeTask({ id: 'owned-gone', remoteRef: makeRemoteRef(), syncState: 'clean' }),
      ],
    })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    const ids = useTodoStore.getState().tasks.map((t) => t.id)
    expect(ids).toEqual(['foreign-ref'])
    expect(fakePushTask).not.toHaveBeenCalled()
  })

  it('on pull failure sets errorKey and clears loading', async () => {
    useTodoStore.setState({ integration: makeIntegrationState() })
    fakePullTasks.mockResolvedValueOnce({ ok: false, errorKey: 'pullFailed' })
    await useTodoStore.getState().syncNow()
    expect(useTodoStore.getState().errorKey).toBe('pullFailed')
    expect(useTodoStore.getState().loading).toBe(false)
  })

  it('on full success updates lastSyncAt and clears loading', async () => {
    useTodoStore.setState({ integration: makeIntegrationState() })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))
    await useTodoStore.getState().syncNow()
    const state = useTodoStore.getState()
    expect(state.integration?.lastSyncAt).not.toBeNull()
    expect(state.loading).toBe(false)
    expect(state.errorKey).toBeNull()
  })
})

describe('todo store — integration: syncNow concurrency', () => {
  it('does not revert containers that refreshContainers read mid-sync', async () => {
    const grown: RemoteContainer[] = [...listsFixture, { id: 'list-new', name: 'Struggle' }]
    useTodoStore.setState({
      integration: makeIntegrationState({ mapping: mappingFixture }),
      tasks: [],
    })

    // The wizard creates a column while the pull is in flight: the refresh
    // lands first, and `syncNow` finishes by writing `lastSyncAt`. A spread
    // of its own stale snapshot would take the new column back out.
    fakePullTasks.mockImplementationOnce(async () => {
      useTodoStore.setState((state) => ({
        integration: state.integration ? { ...state.integration, lists: grown } : null,
      }))
      return ok({ tasks: [], refs: {} })
    })

    await useTodoStore.getState().syncNow()

    const integration = useTodoStore.getState().integration
    expect(integration?.lists).toEqual(grown)
    expect(integration?.lastSyncAt).toBeGreaterThan(0)
  })
})

describe('todo store — integration: push-on-mutation', () => {
  it('addTask with active mapping marks task dirty and fires pushTask', async () => {
    useTodoStore.setState({ integration: makeIntegrationState() })
    fakePushTask.mockResolvedValue(ok(makeRemoteRef()))
    useTodoStore.getState().addTask({ title: 'New' })
    // The new task is the most-recently-prepended one
    expect(useTodoStore.getState().tasks[0].syncState).toBe('dirty')
    await vi.waitFor(() => {
      expect(fakePushTask).toHaveBeenCalled()
    })
  })

  it('addTask with integration but no mapping is treated as no-integration (clean, no push)', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState({ mapping: null }),
    })
    useTodoStore.getState().addTask({ title: 'Wizard mid-flow' })
    expect(useTodoStore.getState().tasks[0].syncState).toBe('clean')
    // give microtasks a chance to fire — they shouldn't
    await Promise.resolve()
    expect(fakePushTask).not.toHaveBeenCalled()
  })

  it('setStatus with mapping marks dirty and pushes with op kind="status"', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: makeRemoteRef() })],
    })
    fakePushTask.mockResolvedValue(ok(makeRemoteRef()))
    useTodoStore.getState().setStatus('x', 'inprogress')
    await vi.waitFor(() => {
      expect(fakePushTask).toHaveBeenCalled()
    })
    const op = fakePushTask.mock.calls[0][1]
    expect(op).toEqual({ kind: 'status', previous: 'input' })
  })

  it('setProject with mapping marks dirty and pushes with op kind="project"', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: makeRemoteRef(), projectId: null })],
    })
    fakePushTask.mockResolvedValue(ok(makeRemoteRef()))
    useTodoStore.getState().setProject('x', 'label-1')
    await vi.waitFor(() => {
      expect(fakePushTask).toHaveBeenCalled()
    })
    const op = fakePushTask.mock.calls[0][1]
    expect(op).toEqual({ kind: 'project', previous: null })
  })

  it('pushTaskAsync success path updates remoteRef and clears dirty flag', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: null, syncState: 'clean' })],
    })
    const newRef = makeRemoteRef({ cardId: 'card-async' })
    fakePushTask.mockResolvedValueOnce(ok(newRef))
    useTodoStore.getState().setStatus('x', 'inprogress')
    await vi.waitFor(() => {
      const task = useTodoStore.getState().tasks.find((t) => t.id === 'x')!
      expect(task.remoteRef).toEqual(newRef)
      expect(task.syncState).toBe('clean')
    })
  })

  it('pushTaskAsync failure path sets syncState="error" and surfaces errorKey', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: makeRemoteRef() })],
    })
    fakePushTask.mockResolvedValueOnce({ ok: false, errorKey: 'pushFailed' })
    useTodoStore.getState().setStatus('x', 'inprogress')
    await vi.waitFor(() => {
      const state = useTodoStore.getState()
      expect(state.tasks.find((t) => t.id === 'x')?.syncState).toBe('error')
      expect(state.errorKey).toBe('pushFailed')
    })
  })

  it('addTask without integration leaves task clean and never calls adapter', () => {
    useTodoStore.getState().addTask({ title: 'No integration' })
    expect(useTodoStore.getState().tasks[0].syncState).toBe('clean')
    expect(fakePushTask).not.toHaveBeenCalled()
  })

  it('setStatus without integration leaves task clean and never calls adapter', () => {
    useTodoStore.setState({ tasks: [makeTask()] })
    useTodoStore.getState().setStatus('1', 'inprogress')
    expect(useTodoStore.getState().tasks[0].syncState).toBe('clean')
    expect(fakePushTask).not.toHaveBeenCalled()
  })
})

describe('todo store — conflict handling', () => {
  it('flags the task and leaves the global error alone on a conflicting push', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: makeRemoteRef() })],
    })
    fakePushTask.mockResolvedValueOnce({ ok: false, errorKey: 'conflict' })

    useTodoStore.getState().setStatus('x', 'inprogress')

    await vi.waitFor(() => {
      const state = useTodoStore.getState()
      expect(state.conflictTaskIds).toEqual(['x'])
      expect(state.tasks.find((t) => t.id === 'x')?.syncState).toBe('error')
      // A conflict is one task's problem, not the widget's: the error banner
      // would otherwise blame the whole integration for a lost race.
      expect(state.errorKey).toBeNull()
    })
  })

  it('never lists the same task twice', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: makeRemoteRef() })],
    })
    fakePushTask.mockResolvedValue({ ok: false, errorKey: 'conflict' })

    useTodoStore.getState().setStatus('x', 'inprogress')
    await vi.waitFor(() => expect(useTodoStore.getState().conflictTaskIds).toEqual(['x']))
    useTodoStore.getState().setStatus('x', 'struggle')
    await vi.waitFor(() => expect(fakePushTask).toHaveBeenCalledTimes(2))

    expect(useTodoStore.getState().conflictTaskIds).toEqual(['x'])
  })

  it('clears the flag once a push finally lands', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: makeRemoteRef() })],
      conflictTaskIds: ['x'],
    })
    fakePushTask.mockResolvedValueOnce(ok(makeRemoteRef({ cardId: 'fresh' })))

    useTodoStore.getState().setStatus('x', 'inprogress')

    await vi.waitFor(() => expect(useTodoStore.getState().conflictTaskIds).toEqual([]))
  })

  it('keeps syncing the other tasks when one push conflicts', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        makeTask({ id: 'loser', syncState: 'dirty', remoteRef: makeRemoteRef({ cardId: 'c-l' }) }),
        makeTask({ id: 'winner', syncState: 'dirty', remoteRef: makeRemoteRef({ cardId: 'c-w' }) }),
      ],
    })
    fakePushTask.mockImplementation(async (task: TodoTask) =>
      task.id === 'loser'
        ? { ok: false, errorKey: 'conflict' }
        : ok(makeRemoteRef({ cardId: 'c-w', etag: 'pushed' })),
    )
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    // Both were attempted, the pull still ran, and no banner was raised.
    expect(fakePushTask).toHaveBeenCalledTimes(2)
    expect(fakePullTasks).toHaveBeenCalledTimes(1)
    expect(useTodoStore.getState().errorKey).toBeNull()
  })

  it('lets the remote version win for a conflicted task the pull brings back', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        makeTask({
          id: 'loser',
          title: 'my rolled-back edit',
          syncState: 'dirty',
          remoteRef: makeRemoteRef(),
          linkedTab: { url: 'https://local-tab.example', title: 'Local' },
        }),
      ],
    })
    fakePushTask.mockResolvedValueOnce({ ok: false, errorKey: 'conflict' })
    fakePullTasks.mockResolvedValueOnce(
      ok({
        tasks: [
          makeTask({
            id: 'loser',
            title: 'what the remote says',
            syncState: 'clean',
            remoteRef: makeRemoteRef({ etag: 'remote-wins' }),
          }),
        ],
        refs: {},
      }),
    )

    await useTodoStore.getState().syncNow()

    const state = useTodoStore.getState()
    const task = state.tasks.find((t) => t.id === 'loser')!
    expect(task.title).toBe('what the remote says')
    // The refused push left 'error' behind; the winning pull clears it.
    expect(task.syncState).toBe('clean')
    expect(state.conflictTaskIds).toEqual([])
    // Local-only fields still survive — the conflict was about remote data.
    expect(task.linkedTab).toEqual({ url: 'https://local-tab.example', title: 'Local' })
  })

  it('keeps the flag on a surviving task the pull says nothing about', async () => {
    // A task with a foreign ref cannot be part of this backend's pull, so the
    // reconcile keeps it — and nothing has resolved its conflict either.
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'foreign', syncState: 'error', remoteRef: makeForeignRef() })],
      conflictTaskIds: ['foreign'],
    })
    fakePushTask.mockResolvedValueOnce({ ok: false, errorKey: 'conflict' })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    expect(useTodoStore.getState().conflictTaskIds).toEqual(['foreign'])
  })

  it('drops a flag whose task no longer exists', async () => {
    // Otherwise the list grows forever with ids that badge nothing: a task
    // deleted on the remote leaves the local list during the reconcile.
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'gone', syncState: 'error', remoteRef: makeRemoteRef() })],
      conflictTaskIds: ['gone', 'never-existed'],
    })
    fakePushTask.mockResolvedValueOnce({ ok: false, errorKey: 'conflict' })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    expect(useTodoStore.getState().tasks).toEqual([])
    expect(useTodoStore.getState().conflictTaskIds).toEqual([])
  })

  it('clearIntegration drops the whole list', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: makeRemoteRef() })],
      conflictTaskIds: ['x'],
    })

    useTodoStore.getState().clearIntegration()

    expect(useTodoStore.getState().conflictTaskIds).toEqual([])
  })

  it('never reaches storage', async () => {
    // A badge surviving a browser restart would outlive the sync it describes,
    // so the list is absent from `partialize` — this is what proves it.
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x' })],
      conflictTaskIds: ['x'],
    })

    await useTodoStore.getState().commit()

    expect(setAreaMock).toHaveBeenCalled()
    const written = setAreaMock.mock.calls.at(-1)?.[2] as
      | { state: Record<string, unknown> }
      | undefined
    expect(Object.keys(written?.state ?? {}).sort()).toEqual(['integration', 'tasks'])
  })
})

describe('todo store — push phase concurrency', () => {
  it('pushes sequentially for a descriptor that does not opt in', async () => {
    // Trello's descriptor leaves `pushConcurrency` unset, so phase 1 must
    // behave exactly as it always has: one push in flight at a time.
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        makeTask({ id: 'a', syncState: 'dirty', remoteRef: makeRemoteRef({ cardId: 'c-a' }) }),
        makeTask({ id: 'b', syncState: 'dirty', remoteRef: makeRemoteRef({ cardId: 'c-b' }) }),
        makeTask({ id: 'c', syncState: 'dirty', remoteRef: makeRemoteRef({ cardId: 'c-c' }) }),
      ],
    })

    let live = 0
    let peak = 0
    fakePushTask.mockImplementation(async () => {
      live += 1
      peak = Math.max(peak, live)
      await new Promise((resolve) => setTimeout(resolve, 0))
      live -= 1
      return ok(makeRemoteRef())
    })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    expect(peak).toBe(1)
    expect(fakePushTask).toHaveBeenCalledTimes(3)
  })

  it('starts nothing new after the first hard failure, and skips the pull', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        makeTask({ id: 'a', syncState: 'dirty', remoteRef: makeRemoteRef({ cardId: 'c-a' }) }),
        makeTask({ id: 'b', syncState: 'dirty', remoteRef: makeRemoteRef({ cardId: 'c-b' }) }),
        makeTask({ id: 'c', syncState: 'dirty', remoteRef: makeRemoteRef({ cardId: 'c-c' }) }),
      ],
    })
    fakePushTask.mockResolvedValueOnce({ ok: false, errorKey: 'rateLimited' })

    await useTodoStore.getState().syncNow()

    expect(fakePushTask).toHaveBeenCalledTimes(1)
    expect(fakePullTasks).not.toHaveBeenCalled()
    expect(useTodoStore.getState().errorKey).toBe('rateLimited')
    expect(useTodoStore.getState().loading).toBe(false)
  })
})

describe('todo store — a failed push that created something', () => {
  /** What a Vikunja create-then-fail hands back: the error plus the new ref. */
  function partialCreate(ref: TrelloRemoteRef): IntegrationOutcome<RemoteTaskRef> {
    return { ok: false, errorKey: 'rateLimited', ref }
  }

  it('persists the ref the adapter reported, and keeps the task in error', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: null, syncState: 'dirty' })],
    })
    const created = makeRemoteRef({ cardId: 'created-before-the-failure' })
    fakePushTask.mockResolvedValueOnce(partialCreate(created))

    useTodoStore.getState().setStatus('x', 'inprogress')

    await vi.waitFor(() => {
      const task = useTodoStore.getState().tasks.find((t) => t.id === 'x')!
      expect(task.remoteRef).toEqual(created)
      expect(task.syncState).toBe('error')
    })
    expect(useTodoStore.getState().errorKey).toBe('rateLimited')
  })

  it('keeps the previous ref when the failure reports none', async () => {
    const known = makeRemoteRef({ cardId: 'known' })
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: known })],
    })
    fakePushTask.mockResolvedValueOnce({ ok: false, errorKey: 'network' })

    useTodoStore.getState().setStatus('x', 'inprogress')

    await vi.waitFor(() => {
      expect(useTodoStore.getState().tasks.find((t) => t.id === 'x')?.syncState).toBe('error')
    })
    expect(useTodoStore.getState().tasks.find((t) => t.id === 'x')?.remoteRef).toEqual(known)
  })

  it('does not create the task a second time on the next sync', async () => {
    // The whole point of carrying the ref: a retry must resync the record that
    // exists, not make another one.
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: null, syncState: 'dirty' })],
    })
    const created = makeRemoteRef({ cardId: 'created-before-the-failure' })
    fakePushTask.mockResolvedValueOnce(partialCreate(created))
    fakePullTasks.mockResolvedValue(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()
    expect(fakePushTask.mock.calls[0][1]).toEqual({ kind: 'create' })

    fakePushTask.mockResolvedValueOnce(ok(created))
    await useTodoStore.getState().syncNow()

    expect(fakePushTask).toHaveBeenCalledTimes(2)
    expect(fakePushTask.mock.calls[1][1]).toEqual({ kind: 'resync' })
  })

  it('retries a pushed task as a resync, never as a title/description update', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', remoteRef: makeRemoteRef(), syncState: 'error' })],
    })
    fakePushTask.mockResolvedValueOnce(ok(makeRemoteRef()))
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    expect(fakePushTask.mock.calls[0][1]).toEqual({ kind: 'resync' })
  })
})

describe('todo store — syncNow robustness', () => {
  it('clears loading even when the adapter throws', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'x', syncState: 'dirty', remoteRef: makeRemoteRef() })],
    })
    fakePushTask.mockRejectedValueOnce(new Error('adapter broke its contract'))

    await expect(useTodoStore.getState().syncNow()).rejects.toThrow('adapter broke')

    // A spinner stuck on `true` would leave the user no way to start another
    // sync at all.
    expect(useTodoStore.getState().loading).toBe(false)
  })

  it('clears loading on the pull failure path too', async () => {
    useTodoStore.setState({ integration: makeIntegrationState(), tasks: [] })
    fakePullTasks.mockResolvedValueOnce({ ok: false, errorKey: 'pullFailed' })

    await useTodoStore.getState().syncNow()

    expect(useTodoStore.getState().loading).toBe(false)
    expect(useTodoStore.getState().errorKey).toBe('pullFailed')
  })

  it('runs pushes in parallel for a descriptor that opts in', async () => {
    // The real Vikunja descriptor asks for 4.
    useTodoStore.setState({
      integration: makeVikunjaIntegrationState(),
      tasks: [1, 2, 3, 4, 5].map((n) =>
        makeTask({ id: `t-${n}`, syncState: 'dirty', remoteRef: makeForeignRef({ taskId: n }) }),
      ),
    })

    let live = 0
    let peak = 0
    fakePushTask.mockImplementation(async () => {
      live += 1
      peak = Math.max(peak, live)
      await new Promise((resolve) => setTimeout(resolve, 0))
      live -= 1
      return ok(makeForeignRef())
    })
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    expect(fakePushTask).toHaveBeenCalledTimes(5)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(4)
  })
})

/** The one handover write of this run, whatever else reached storage. */
function handoverWrite(): unknown {
  const call = setAreaMock.mock.calls.find(([, key]) => key === TODO_HANDOVER_KEY)
  return call?.[2]
}

describe('todo store — integration: switchIntegration', () => {
  it('leaves a handover snapshot behind, then drops the integration', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'a', title: 'Keep me', remoteRef: makeRemoteRef() })],
    })

    await useTodoStore.getState().switchIntegration()

    expect(handoverWrite()).toMatchObject({
      version: 1,
      integrationName: 'trello',
      boardName: 'Test Board',
      // Taken *before* the unlinking: a snapshot of the cleared state would
      // have lost every ref.
      tasks: [expect.objectContaining({ title: 'Keep me', remoteRef: makeRemoteRef() })],
    })
    expect(typeof (handoverWrite() as { savedAt: unknown }).savedAt).toBe('number')

    // …and then the disconnect itself happened.
    expect(useTodoStore.getState().integration).toBeNull()
    expect(useTodoStore.getState().tasks[0].remoteRef).toBeNull()
    expect(removeAreaMock).toHaveBeenCalledWith('local', TODO_STORAGE_KEY)
  })

  it('never writes the credentials into the snapshot', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState({
        config: { apiKey: 'ak_live', token: 'tk_secret', boardId: 'board-1' },
      }),
      tasks: [makeTask()],
    })

    await useTodoStore.getState().switchIntegration()

    const written = JSON.stringify(handoverWrite())
    expect(written).not.toContain('tk_secret')
    expect(written).not.toContain('ak_live')
    expect(written).not.toContain('apiKey')
    expect(written).not.toContain('config')
  })

  it('writes nothing when there is no integration to hand over', async () => {
    useTodoStore.setState({ integration: null, tasks: [makeTask()] })

    await useTodoStore.getState().switchIntegration()

    expect(handoverWrite()).toBeUndefined()
  })
})

describe('todo store — integration: local tasks are imported on purpose', () => {
  it('does not push tasks that predate a backend which wants an explicit import', async () => {
    useTodoStore.setState({
      integration: makeVikunjaIntegrationState(),
      tasks: [
        makeTask({ id: 'old-local', syncState: 'clean', remoteRef: null }),
        makeTask({ id: 'fresh', syncState: 'dirty', remoteRef: null }),
      ],
    })
    fakePushTask.mockResolvedValue(ok(makeForeignRef({ taskId: 7 })))
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    // Only the one created while the integration was active.
    expect(fakePushTask).toHaveBeenCalledTimes(1)
    expect((fakePushTask.mock.calls[0][0] as TodoTask).id).toBe('fresh')
    // And the untouched one is still there, unlinked.
    const old = useTodoStore.getState().tasks.find((t) => t.id === 'old-local')
    expect(old?.remoteRef).toBeNull()
    expect(old?.syncState).toBe('clean')
  })

  it('pushes them for Trello, whose behaviour predates the flag', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'old-local', syncState: 'clean', remoteRef: null })],
    })
    fakePushTask.mockResolvedValue(ok(makeRemoteRef()))
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    expect(fakePushTask).toHaveBeenCalledTimes(1)
  })

  it('importLocalTasks marks the named tasks dirty and pushes them as creates', async () => {
    useTodoStore.setState({
      integration: makeVikunjaIntegrationState(),
      tasks: [
        makeTask({ id: 'a', syncState: 'clean', remoteRef: null }),
        makeTask({ id: 'b', syncState: 'clean', remoteRef: null }),
      ],
    })
    fakePushTask.mockResolvedValue(ok(makeForeignRef({ taskId: 9 })))
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().importLocalTasks(['a'])

    expect(fakePushTask).toHaveBeenCalledTimes(1)
    const [pushed, op] = fakePushTask.mock.calls[0] as [TodoTask, { kind: string }]
    expect(pushed.id).toBe('a')
    expect(pushed.syncState).toBe('dirty')
    expect(op).toEqual({ kind: 'create' })
  })

  it('ignores ids of tasks that are already linked', async () => {
    useTodoStore.setState({
      integration: makeVikunjaIntegrationState(),
      tasks: [makeTask({ id: 'linked', syncState: 'clean', remoteRef: makeForeignRef() })],
    })

    await useTodoStore.getState().importLocalTasks(['linked', 'nobody'])

    // Nothing to import means nothing to sync either.
    expect(fakePushTask).not.toHaveBeenCalled()
    expect(fakePullTasks).not.toHaveBeenCalled()
    expect(useTodoStore.getState().tasks[0].syncState).toBe('clean')
  })
})

/**
 * What the store asks the descriptor instead of reading a slice field, now
 * that a backend may keep its scopes, mappings and project rules elsewhere.
 * Driven through the **real** descriptors (only the transport is faked), so a
 * hook that stopped being called fails here.
 */
describe('todo store — the descriptor decides what is set up', () => {
  it('syncs a Vikunja connection whose mapping is only on the board', async () => {
    useTodoStore.setState({
      integration: makeVikunjaIntegrationState(),
      tasks: [makeTask({ id: 't-1', syncState: 'dirty' })],
    })
    fakePushTask.mockResolvedValueOnce(ok(makeForeignRef()))
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    // The slice's own `mapping` is `null` here: the old gate would have
    // answered `mappingIncomplete` and never called the adapter.
    expect(useTodoStore.getState().errorKey).toBeNull()
    expect(fakePushTask).toHaveBeenCalledTimes(1)
    expect(fakePullTasks).toHaveBeenCalledTimes(1)
  })

  it('refuses to sync while a board is unmapped', async () => {
    useTodoStore.setState({ integration: makeVikunjaIntegrationState({ mapping: null }) })

    await useTodoStore.getState().syncNow()

    expect(useTodoStore.getState().errorKey).toBe('mappingIncomplete')
    expect(fakePullTasks).not.toHaveBeenCalled()
  })

  it('passes the scope and the mapping through as the descriptor left them', async () => {
    useTodoStore.setState({
      integration: makeVikunjaIntegrationState(),
      tasks: [makeTask({ id: 't-1', syncState: 'dirty' })],
    })
    fakePushTask.mockResolvedValueOnce(ok(makeForeignRef()))
    fakePullTasks.mockResolvedValueOnce(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()

    // `getScope` still answers (the default board), and the slice mapping is
    // honestly `null` — the adapter reads its own board.
    expect(fakePullTasks).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { projectId: 1, viewId: 4 }, mapping: null }),
    )
    expect(fakePushTask.mock.calls[0][2]).toMatchObject({
      scope: { projectId: 1, viewId: 4 },
      mapping: null,
    })
  })

  it('pushes a Vikunja task the moment it is added, mirror or no mirror', async () => {
    useTodoStore.setState({ integration: makeVikunjaIntegrationState() })
    fakePushTask.mockResolvedValueOnce(ok(makeForeignRef()))

    useTodoStore.getState().addTask({ title: 'Buy milk' })

    expect(useTodoStore.getState().tasks[0].syncState).toBe('dirty')
    await vi.waitFor(() => expect(fakePushTask).toHaveBeenCalledTimes(1))
  })

  it('leaves a task clean while a board is unmapped', () => {
    useTodoStore.setState({ integration: makeVikunjaIntegrationState({ mapping: null }) })

    useTodoStore.getState().addTask({ title: 'Buy milk' })

    expect(useTodoStore.getState().tasks[0].syncState).toBe('clean')
    expect(fakePushTask).not.toHaveBeenCalled()
  })
})

describe('todo store — the project policy', () => {
  it('gives a new task the default board when the backend requires a project', () => {
    useTodoStore.setState({ integration: makeVikunjaIntegrationState() })
    fakePushTask.mockResolvedValue(ok(makeForeignRef()))

    useTodoStore.getState().addTask({ title: 'Buy milk' })

    // `defaultProjectId: 1`, as `Project.id` spells it.
    expect(useTodoStore.getState().tasks[0].projectId).toBe('1')
  })

  it('keeps the project the caller named', () => {
    useTodoStore.setState({ integration: makeVikunjaIntegrationState() })
    fakePushTask.mockResolvedValue(ok(makeForeignRef()))

    useTodoStore.getState().addTask({ title: 'Buy milk', projectId: '8' })

    expect(useTodoStore.getState().tasks[0].projectId).toBe('8')
  })

  it('leaves a task without a project for a backend that does not require one', () => {
    useTodoStore.setState({ integration: makeIntegrationState() })
    fakePushTask.mockResolvedValue(ok(makeRemoteRef()))

    useTodoStore.getState().addTask({ title: 'Buy milk' })

    expect(useTodoStore.getState().tasks[0].projectId).toBeNull()
  })

  it('setProject does nothing when the backend’s project cannot change', () => {
    useTodoStore.setState({
      integration: makeVikunjaIntegrationState(),
      tasks: [makeTask({ id: 't-1', projectId: '1' })],
    })

    useTodoStore.getState().setProject('t-1', '8')

    // A Vikunja task lives *in* its project: a local move would be a value no
    // sync could ever honour.
    expect(useTodoStore.getState().tasks[0].projectId).toBe('1')
    expect(useTodoStore.getState().tasks[0].syncState).toBe('clean')
    expect(fakePushTask).not.toHaveBeenCalled()
  })

  it('setProject still moves a task for a backend where it may', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 't-1', projectId: null, remoteRef: makeRemoteRef() })],
    })
    fakePushTask.mockResolvedValueOnce(ok(makeRemoteRef()))

    useTodoStore.getState().setProject('t-1', 'label-1')

    expect(useTodoStore.getState().tasks[0].projectId).toBe('label-1')
    await vi.waitFor(() => expect(fakePushTask).toHaveBeenCalledTimes(1))
    expect(fakePushTask.mock.calls[0][1]).toEqual({ kind: 'project', previous: null })
  })
})

describe('todo store — where the cached scope state is written', () => {
  const containers: RemoteContainer[] = [{ id: '1', name: 'To-Do' }]

  it('writes nothing to the slice for a backend that keeps it per board', async () => {
    useTodoStore.setState({ integration: makeVikunjaIntegrationState({ mapping: null }) })
    fakeListProjects.mockResolvedValue(ok(projectsFixture))

    await useTodoStore.getState().pickScope({ projectId: 1, viewId: 4 }, 'Inbox', containers, [])

    const integration = useTodoStore.getState().integration
    if (integration?.name !== 'vikunja') throw new Error('expected the vikunja branch')
    // The board has it all…
    expect(integration.config.boards[0]).toMatchObject({ name: 'Inbox', containers })
    // …and the dead single-board fields stay empty.
    expect(integration.boardName).toBeNull()
    expect(integration.lists).toStrictEqual([])
    expect(integration.mapping).toBeNull()
  })

  it('still writes the slice for a backend that has nowhere else to keep it', async () => {
    useTodoStore.setState({ integration: makeIntegrationState({ mapping: null }) })

    await useTodoStore.getState().pickScope({ boardId: 'board-9' }, 'Other board', containers, [])

    const integration = useTodoStore.getState().integration
    expect(integration?.boardName).toBe('Other board')
    expect(integration?.lists).toStrictEqual(containers)
    expect(integration?.mapping).toBeNull()
  })

  it('setMapping lands on the board for one backend and on the slice for the other', async () => {
    useTodoStore.setState({ integration: makeVikunjaIntegrationState({ mapping: null }) })
    fakePullTasks.mockResolvedValue(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().setMapping(mappingFixture)

    const vikunja = useTodoStore.getState().integration
    if (vikunja?.name !== 'vikunja') throw new Error('expected the vikunja branch')
    expect(vikunja.config.boards[0].mapping).toStrictEqual(mappingFixture)
    expect(vikunja.mapping).toBeNull()

    useTodoStore.setState({ integration: makeIntegrationState({ mapping: null }) })
    await useTodoStore.getState().setMapping(mappingFixture)

    expect(useTodoStore.getState().integration?.mapping).toStrictEqual(mappingFixture)
  })
})

describe('todo store — clearError', () => {
  it('retires the error without syncing', () => {
    useTodoStore.setState({ integration: makeIntegrationState(), errorKey: 'permissionMissing' })

    useTodoStore.getState().clearError()

    expect(useTodoStore.getState().errorKey).toBeNull()
    expect(fakePullTasks).not.toHaveBeenCalled()
  })

  it('does not notify subscribers when there was nothing to clear', () => {
    useTodoStore.setState({ errorKey: null })
    const seen = vi.fn()
    const unsubscribe = useTodoStore.subscribe(seen)

    useTodoStore.getState().clearError()
    unsubscribe()

    expect(seen).not.toHaveBeenCalled()
  })
})
describe('todo store — syncNow never overlaps, and never drops a caller', () => {
  /**
   * Pulls that hang until the test releases them, so a run can be held open
   * while the next caller arrives.
   */
  function heldPulls() {
    const held: { ctx: { mapping: StatusListMapping }; release: () => void }[] = []
    fakePullTasks.mockImplementation(
      (ctx: { mapping: StatusListMapping }) =>
        new Promise((resolve) => {
          held.push({ ctx, release: () => resolve(ok({ tasks: [], refs: {} })) })
        }),
    )
    return held
  }

  it('hands every caller one run, then exactly one follow-up for the ones that waited', async () => {
    useTodoStore.setState({ integration: makeIntegrationState(), tasks: [] })
    fakePullTasks.mockResolvedValue(ok({ tasks: [], refs: {} }))

    // All three calls happen before the first run can finish, so two of them
    // queue — and coalesce into a single follow-up.
    const first = useTodoStore.getState().syncNow()
    const second = useTodoStore.getState().syncNow({ silent: true })
    const third = useTodoStore.getState().syncNow({ silent: true })

    expect(second).toBe(first)
    expect(third).toBe(first)
    await Promise.all([first, second, third])

    expect(fakePullTasks).toHaveBeenCalledTimes(2)
  })

  it('pushes what a caller made pending *after* the running sync read the list', async () => {
    useTodoStore.setState({ integration: makeIntegrationState(), tasks: [] })
    const held = heldPulls()
    fakePushTask.mockResolvedValue(ok(makeRemoteRef()))

    const first = useTodoStore.getState().syncNow()
    await vi.waitFor(() => expect(held).toHaveLength(1))

    // Phase 1 of the running sync has already iterated its snapshot, so this
    // task can only be pushed by a run that starts afterwards.
    useTodoStore.setState({
      tasks: [makeTask({ id: 'late', syncState: 'dirty', remoteRef: null })],
    })
    const second = useTodoStore.getState().syncNow()

    held[0].release()
    await vi.waitFor(() => expect(held).toHaveLength(2))
    held[1].release()
    await Promise.all([first, second])

    // Two runs, and the late task pushed once by the second of them.
    expect(fakePullTasks).toHaveBeenCalledTimes(2)
    expect(fakePushTask).toHaveBeenCalledTimes(1)
    expect((fakePushTask.mock.calls[0][0] as TodoTask).id).toBe('late')
  })

  it('never pushes the same task twice, however many callers overlap', async () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [makeTask({ id: 'a', syncState: 'dirty', remoteRef: null })],
    })
    const held = heldPulls()
    fakePushTask.mockResolvedValue(ok(makeRemoteRef()))

    const first = useTodoStore.getState().syncNow()
    await vi.waitFor(() => expect(held).toHaveLength(1))
    const second = useTodoStore.getState().syncNow({ silent: true })

    held[0].release()
    await vi.waitFor(() => expect(held).toHaveLength(2))
    held[1].release()
    await Promise.all([first, second])

    // The first run pushed it and marked it clean; the follow-up finds
    // nothing to do — a second `create` would mean two records remotely.
    expect(fakePushTask).toHaveBeenCalledTimes(1)
  })

  it('reconciles under the mapping that was saved during the running sync', async () => {
    useTodoStore.setState({ integration: makeIntegrationState(), tasks: [] })
    const held = heldPulls()

    const running = useTodoStore.getState().syncNow()
    await vi.waitFor(() => expect(held).toHaveLength(1))

    // `setMapping` writes the mapping and syncs; the sync it asks for must
    // be a *new* run, or the widget reconciles the pull of the old mapping
    // and shows every task in the wrong section until the next sync.
    const nextMapping: StatusListMapping = { ...mappingFixture, input: ['list-renamed'] }
    const saving = useTodoStore.getState().setMapping(nextMapping)

    held[0].release()
    await vi.waitFor(() => expect(held).toHaveLength(2))
    held[1].release()
    await Promise.all([running, saving])

    expect(held[0].ctx.mapping).toEqual(mappingFixture)
    expect(held[1].ctx.mapping).toEqual(nextMapping)
  })

  it('releases the slot, so a later sync really runs', async () => {
    useTodoStore.setState({ integration: makeIntegrationState(), tasks: [] })
    fakePullTasks.mockResolvedValue(ok({ tasks: [], refs: {} }))

    await useTodoStore.getState().syncNow()
    await useTodoStore.getState().syncNow()

    expect(fakePullTasks).toHaveBeenCalledTimes(2)
  })

  it('creates the imported tasks even when a sync was already running', async () => {
    useTodoStore.setState({
      integration: makeVikunjaIntegrationState(),
      tasks: [makeTask({ id: 'a', syncState: 'clean', remoteRef: null })],
    })
    const held = heldPulls()
    fakePushTask.mockResolvedValue(ok(makeForeignRef({ taskId: 5 })))

    // A sync is in flight, and its push phase pushed nothing: the task is a
    // clean local one Vikunja does not import by itself.
    const running = useTodoStore.getState().syncNow()
    await vi.waitFor(() => expect(held).toHaveLength(1))

    const importing = useTodoStore.getState().importLocalTasks(['a'])

    held[0].release()
    await vi.waitFor(() => expect(held).toHaveLength(2))
    held[1].release()
    await Promise.all([running, importing])

    // The import marked the task dirty and the follow-up run created it.
    // Joining the running sync instead would have resolved with the task
    // still dirty and the button still offering an import of it.
    expect(fakePushTask).toHaveBeenCalledTimes(1)
    expect((fakePushTask.mock.calls[0][0] as TodoTask).id).toBe('a')
    expect((fakePushTask.mock.calls[0][0] as TodoTask).syncState).toBe('dirty')
    expect(fakePushTask.mock.calls[0][1]).toEqual({ kind: 'create' })
  })
})
