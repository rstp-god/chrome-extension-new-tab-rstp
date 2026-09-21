// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { IntegrationState, TodoTask } from '@/widgets/Todo/store/store.ts'

/**
 * The three things the summary gained in task 8: a confirmation that is a
 * real dialog rather than `window.confirm`, a switch that hands the tasks
 * over to the next integration, and the explicit import of tasks a backend
 * refuses to sweep along by itself.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { t: (key: string) => key, changeLanguage: async () => {} },
  }),
}))

const setAreaMock = vi.hoisted(() =>
  vi.fn<(area: string, key: string, value: unknown) => Promise<boolean>>(async () => true),
)

vi.mock('@/services/chrome/storage.ts', () => ({
  getArea: vi.fn(async () => null),
  setArea: setAreaMock,
  removeArea: vi.fn(async () => true),
  getLocal: vi.fn(async () => null),
  setLocal: vi.fn(async () => true),
}))

const fakePullTasks = vi.hoisted(() => vi.fn())
const fakePushTask = vi.hoisted(() => vi.fn())

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
          connect: vi.fn(),
          disconnect: vi.fn(),
          listScopes: vi.fn(),
          listContainers: vi.fn(),
          listProjects: vi.fn(),
          pullTasks: fakePullTasks,
          pushTask: fakePushTask,
        }),
      }
    },
  }
})

import { TodoSettingsSummary } from '@/widgets/Todo/components/settings/TodoSettingsSummary.tsx'
import { withDefaultBoardPatch } from '@/widgets/Todo/integrations/vikunja/boards.ts'
import { TODO_HANDOVER_KEY, useTodoStore } from '@/widgets/Todo/store/store.ts'

const MAPPING = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['2'],
  completed: ['3'],
  deleted: ['2'],
}

const VIKUNJA: Extract<IntegrationState, { name: 'vikunja' }> = {
  name: 'vikunja',
  config: {
    baseUrl: 'https://vikunja.example',
    token: 'tk_super-secret-value',
    boards: [
      {
        projectId: 1,
        viewId: 4,
        name: 'Probe',
        containers: [],
        mapping: MAPPING,
        kanbanMapping: true,
      },
    ],
    defaultProjectId: 1,
  },
  // Dead for this backend (task 2): the board holds the name, the buckets
  // and the mapping, and its own summary section shows them.
  boardName: null,
  lists: [],
  projects: [],
  mapping: null,
  lastSyncAt: null,
}

const TRELLO: IntegrationState = {
  name: 'trello',
  config: { apiKey: 'k', token: 't', boardId: 'board-1' },
  boardName: 'Board',
  lists: [{ id: '1', name: 'Inbox' }],
  projects: [],
  mapping: MAPPING,
  lastSyncAt: null,
}

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

function mount(integration: IntegrationState, tasks: TodoTask[] = []) {
  useTodoStore.setState({
    integration,
    tasks,
    loading: false,
    errorKey: null,
    conflictTaskIds: [],
  })
  render(<TodoSettingsSummary onEditMapping={vi.fn()} onPickScope={vi.fn()} />)
}

async function click(element: HTMLElement) {
  await act(async () => {
    await userEvent.click(element)
  })
}

function handoverWrite(): unknown {
  return setAreaMock.mock.calls.find(([, key]) => key === TODO_HANDOVER_KEY)?.[2]
}

beforeEach(() => {
  setAreaMock.mockClear()
  fakePullTasks.mockReset()
  fakePushTask.mockReset()
  fakePullTasks.mockResolvedValue({ ok: true, value: { tasks: [], refs: {} } })
  fakePushTask.mockResolvedValue({
    ok: true,
    value: { taskId: 7, identifier: '#7', bucketId: 1, updated: '2024-01-01T00:00:00.000Z' },
  })
  useTodoStore.setState({
    tasks: [],
    integration: null,
    loading: false,
    errorKey: null,
    conflictTaskIds: [],
  })
})

afterEach(() => {
  cleanup()
})

describe('TodoSettingsSummary — disconnecting and switching', () => {
  it('asks in a dialog of its own rather than through window.confirm', async () => {
    const nativeConfirm = vi.fn(() => true)
    vi.stubGlobal('confirm', nativeConfirm)
    mount(TRELLO, [makeTask()])

    await click(screen.getByTestId('todo-summary-disconnect'))

    expect(nativeConfirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('todo-confirm-dialog')).toBeTruthy()
    // The wording Trello already had, unchanged.
    expect(screen.getByText('integrations.trello.summary.disconnectConfirm')).toBeTruthy()
    // Nothing happened yet — it is a question.
    expect(useTodoStore.getState().integration).not.toBeNull()
  })

  it('keeps the integration when the question is dismissed', async () => {
    mount(TRELLO)

    await click(screen.getByTestId('todo-summary-disconnect'))
    await click(screen.getByRole('button', { name: 'integrations.actions.cancel' }))

    expect(useTodoStore.getState().integration).not.toBeNull()
    expect(handoverWrite()).toBeUndefined()
  })

  it('hands the tasks over and drops the integration on confirm', async () => {
    mount(VIKUNJA, [makeTask({ title: 'Keep me' })])

    await click(screen.getByTestId('todo-summary-switch'))
    expect(screen.getByText('integrations.vikunja.summary.switchConfirm')).toBeTruthy()
    await click(screen.getByTestId('todo-confirm-accept'))

    expect(handoverWrite()).toMatchObject({
      version: 1,
      integrationName: 'vikunja',
      tasks: [expect.objectContaining({ title: 'Keep me' })],
    })
    expect(useTodoStore.getState().integration).toBeNull()
    // The tasks are still the user's; only the link is gone.
    expect(useTodoStore.getState().tasks).toHaveLength(1)
  })
})

describe('TodoSettingsSummary — importing local tasks', () => {
  const locals = [
    makeTask({ id: 'a', title: 'Older todo' }),
    makeTask({ id: 'b', title: 'Another one' }),
  ]

  it('offers the import with a count and the instance it would write to', async () => {
    mount(VIKUNJA, locals)

    // `count`, so i18next can pick the plural form the language needs. The
    // destination falls back to the host: this connection's project cache
    // holds no board yet, so there is no friendlier name to use.
    expect(screen.getByTestId('todo-import-action').textContent).toContain(
      'integrations.import.action {"count":2,"scope":"vikunja.example"}',
    )
  })

  it('names the board a new task would go to once the cache knows it', async () => {
    mount({ ...VIKUNJA, projects: [{ id: '1', name: 'Probe', pillClassName: null }] }, locals)

    // Which is what the picker reads for this backend: its boards *are* its
    // projects, and the default one is where an import lands.
    expect(screen.getByTestId('todo-import-action').textContent).toContain('"scope":"Probe"')
  })

  it('does not offer it for a backend that imports on its own', () => {
    mount(TRELLO, locals)

    expect(screen.queryByTestId('todo-import-action')).toBeNull()
  })

  it('does not count the widget\u2019s own trash', () => {
    mount(VIKUNJA, [
      makeTask({ id: 'a', title: 'Older todo' }),
      makeTask({ id: 'b', title: 'Thrown away', status: 'deleted' }),
    ])

    expect(screen.getByTestId('todo-import-action').textContent).toContain('"count":1')
  })

  it('previews only what it counted', async () => {
    mount(VIKUNJA, [
      makeTask({ id: 'a', title: 'Older todo' }),
      makeTask({ id: 'b', title: 'Thrown away', status: 'deleted' }),
    ])

    await click(screen.getByTestId('todo-import-action'))

    expect(screen.getByText('Older todo')).toBeTruthy()
    expect(screen.queryByText('Thrown away')).toBeNull()
  })

  it('does not offer it when every task is already linked', () => {
    mount(VIKUNJA, [
      makeTask({
        remoteRef: {
          taskId: 3,
          projectId: 1,
          identifier: '#3',
          bucketId: 1,
          updated: '2024-01-01T00:00:00Z',
        },
      }),
    ])

    expect(screen.queryByTestId('todo-import-action')).toBeNull()
  })

  it('previews the titles before creating anything remotely', async () => {
    mount(VIKUNJA, locals)

    await click(screen.getByTestId('todo-import-action'))

    expect(screen.getByTestId('todo-import-dialog')).toBeTruthy()
    expect(screen.getByText('Older todo')).toBeTruthy()
    expect(screen.getByText('Another one')).toBeTruthy()
    expect(fakePushTask).not.toHaveBeenCalled()
  })

  it('pushes the previewed tasks once the user confirms', async () => {
    mount(VIKUNJA, locals)

    await click(screen.getByTestId('todo-import-action'))
    await click(screen.getByTestId('todo-import-confirm'))

    expect(fakePushTask).toHaveBeenCalledTimes(2)
    expect(fakePushTask.mock.calls.map(([task]) => (task as TodoTask).id).sort()).toEqual([
      'a',
      'b',
    ])
  })
})

describe('TodoSettingsSummary — the error line', () => {
  it('states a failure the banner does not', () => {
    mount(VIKUNJA)
    act(() => {
      useTodoStore.setState({ errorKey: 'pullFailed' })
    })

    expect(screen.getByText('integrations.errors.pullFailed')).toBeTruthy()
  })

  it('stays quiet about one the banner already explains', () => {
    mount(VIKUNJA)
    act(() => {
      useTodoStore.setState({ errorKey: 'permissionMissing' })
    })

    // The widget's banner shows this sentence with the action that ends it;
    // repeating it here would make one problem look like two.
    expect(screen.queryByText('integrations.errors.permissionMissing')).toBeNull()
  })
})

describe('TodoSettingsSummary — what the generic block shows', () => {
  it('names the board and its mapping for a backend that keeps them on the slice', () => {
    mount(TRELLO)

    expect(screen.getByText('integrations.trello.summary.boardLabel')).toBeTruthy()
    expect(screen.getByText('Board')).toBeTruthy()
    expect(screen.getByText('integrations.trello.summary.mappingLabel')).toBeTruthy()
  })

  it('shows neither for a backend that keeps them per board', () => {
    mount(VIKUNJA)

    // Nothing generic to tabulate: the mapping is per board…
    expect(screen.queryByText('integrations.vikunja.summary.mappingLabel')).toBeNull()
    // …and the generic "Board" line has nothing to name either — the boards
    // are listed by the backend's own section, which is where 'Probe' is.
    expect(screen.queryByText('integrations.vikunja.summary.boardLabel')).toBeNull()
    expect(screen.getByText('integrations.vikunja.summary.boards')).toBeTruthy()
    expect(screen.getByTestId('todo-summary-board').textContent).toContain('Probe')
  })
})

describe('TodoSettingsSummary — flat mode', () => {
  it('names the statuses that never leave the extension', () => {
    mount({ ...VIKUNJA, config: withDefaultBoardPatch(VIKUNJA.config, { kanbanMapping: false }) })

    expect(screen.getByTestId('todo-summary-flat-mode')).toBeTruthy()
    expect(screen.getByText('integrations.vikunja.mapping.flatNotice')).toBeTruthy()
    expect(screen.getByText('integrations.vikunja.summary.localOnlyLabel')).toBeTruthy()
    expect(screen.getByText('integrations.mapping.row.inprogress')).toBeTruthy()
    expect(screen.getByText('integrations.mapping.row.struggle')).toBeTruthy()
    expect(screen.getByText('integrations.mapping.row.deleted')).toBeTruthy()
    // The per-status table would repeat one bucket four times, so it is hidden
    // — and with it the only other place those rows appear.
    expect(screen.queryByText('integrations.vikunja.summary.mappingLabel')).toBeNull()
  })
})
