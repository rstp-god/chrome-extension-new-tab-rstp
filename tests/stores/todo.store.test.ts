import { beforeEach, describe, expect, it, vi } from 'vitest'

const focusOrOpenTabMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/services/chrome/tabs.ts', () => ({
  focusOrOpenTab: focusOrOpenTabMock,
}))

const fakeConnect = vi.hoisted(() => vi.fn())
const fakeDisconnect = vi.hoisted(() => vi.fn())
const fakeListBoards = vi.hoisted(() => vi.fn())
const fakeListLists = vi.hoisted(() => vi.fn())
const fakeListProjects = vi.hoisted(() => vi.fn())
const fakePullTasks = vi.hoisted(() => vi.fn())
const fakePushTask = vi.hoisted(() => vi.fn())

vi.mock('@/widgets/Todo/integrations/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/widgets/Todo/integrations/index.ts')>()
  return {
    ...actual,
    getIntegrationDescriptor: (name: string | null | undefined) => {
      if (name !== 'trello') return null
      return {
        name: 'trello',
        titleI18nKey: 'todoWidget:integrations.trello.title',
        descriptionI18nKey: 'todoWidget:integrations.trello.description',
        ConnectForm: () => null,
        create: () => ({
          connect: fakeConnect,
          disconnect: fakeDisconnect,
          listBoards: fakeListBoards,
          listLists: fakeListLists,
          listProjects: fakeListProjects,
          pullTasks: fakePullTasks,
          pushTask: fakePushTask,
        }),
      }
    },
  }
})

import type {
  IntegrationOutcome,
  Project,
  RemoteList,
  RemoteTaskRef,
  StatusListMapping,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore, type IntegrationState, type TodoTask } from '@/widgets/Todo/store/store.ts'

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

const listsFixture: RemoteList[] = [
  { id: 'list-input', name: 'Inbox' },
  { id: 'list-inprogress', name: 'Doing' },
]

function makeIntegrationState(overrides: Partial<IntegrationState> = {}): IntegrationState {
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

function makeRemoteRef(overrides: Partial<RemoteTaskRef> = {}): RemoteTaskRef {
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
  fakeListBoards.mockReset()
  fakeListLists.mockReset()
  fakeListProjects.mockReset()
  fakePullTasks.mockReset()
  fakePushTask.mockReset()
  useTodoStore.setState({ tasks: [], integration: null, loading: false, errorKey: null })
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
    await useTodoStore.getState().connectIntegration(
      // @ts-expect-error — intentional invalid name to exercise the early-return branch
      'notrello',
      { apiKey: 'k', token: 't', boardId: null },
    )
    expect(useTodoStore.getState().errorKey).toBe('unknown')
    expect(fakeConnect).not.toHaveBeenCalled()
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

describe('todo store — integration: pickBoard', () => {
  it('caches board fields AND resets mapping to null (board-switch invalidation)', () => {
    useTodoStore.setState({
      integration: makeIntegrationState({ mapping: mappingFixture }),
    })
    useTodoStore.getState().pickBoard('new-board', 'New Board', listsFixture, projectsFixture)
    const integration = useTodoStore.getState().integration
    expect(integration?.config.boardId).toBe('new-board')
    expect(integration?.boardName).toBe('New Board')
    expect(integration?.lists).toEqual(listsFixture)
    expect(integration?.projects).toEqual(projectsFixture)
    expect(integration?.mapping).toBeNull()
  })

  it('pickBoard with no active integration is a no-op', () => {
    useTodoStore.getState().pickBoard('b', 'B', [], [])
    expect(useTodoStore.getState().integration).toBeNull()
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

describe('todo store — integration: clearIntegration', () => {
  it('drops integration and clears remoteRef + syncState on every task', () => {
    useTodoStore.setState({
      integration: makeIntegrationState(),
      tasks: [
        makeTask({ id: 'a', syncState: 'dirty', remoteRef: makeRemoteRef() }),
        makeTask({ id: 'b', syncState: 'error', remoteRef: makeRemoteRef({ cardId: 'card-2' }) }),
        makeTask({ id: 'c', syncState: 'clean', remoteRef: null }),
      ],
    })
    useTodoStore.getState().clearIntegration()
    const state = useTodoStore.getState()
    expect(state.integration).toBeNull()
    for (const task of state.tasks) {
      expect(task.remoteRef).toBeNull()
      expect(task.syncState).toBe('clean')
    }
  })
})

describe('todo store — integration: syncNow guards', () => {
  it('syncNow without boardId sets mappingIncomplete and never calls adapter', async () => {
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
    expect(task.remoteRef?.etag).toBe('updated')
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
