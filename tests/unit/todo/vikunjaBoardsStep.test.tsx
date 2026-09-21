// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VikunjaBoardsStep } from '@/widgets/Todo/integrations/vikunja/VikunjaBoardsStep.tsx'

import type {
  IntegrationOutcome,
  RemoteContainer,
  RemoteScopeOption,
  StatusListMapping,
  TodoIntegration,
} from '@/widgets/Todo/integrations/types.ts'
import type { IntegrationState, TodoTask, VikunjaBoard } from '@/widgets/Todo/store/store.ts'
import type { Mock } from 'vitest'

/** Keys, not prose — `tests/contracts/i18nKeys.test.ts` guards the copy. */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { t: (key: string) => key, changeLanguage: async () => {} },
  }),
}))

const PREFIX = 'integrations.vikunja.boards'

const COLUMNS: RemoteContainer[] = [
  { id: '1', name: 'To-Do', isDefault: true },
  { id: '3', name: 'Done', isTerminal: true },
]

const MAPPING: StatusListMapping = {
  input: ['1'],
  inprogress: ['1'],
  struggle: ['1'],
  completed: ['3'],
  deleted: ['1'],
}

/** Every project the account offers, both of them with a kanban view. */
const SCOPES: RemoteScopeOption[] = [
  { scope: { projectId: 8, viewId: 80 }, name: 'Work' },
  { scope: { projectId: 9, viewId: 90 }, name: 'Home' },
]

let listScopes: Mock<() => Promise<IntegrationOutcome<RemoteScopeOption[]>>>
let listContainers: Mock<(scope: unknown) => Promise<IntegrationOutcome<RemoteContainer[]>>>
let updateIntegrationConfig: Mock<(config: unknown) => boolean>
let refreshContainers: Mock<() => Promise<boolean>>
let dropTasksOfProject: Mock<(projectId: string) => void>
let syncNow: Mock<() => Promise<void>>
let onBack: Mock<() => void>
let onDone: Mock<() => void>

function board(overrides: Partial<VikunjaBoard> = {}): VikunjaBoard {
  return {
    projectId: 8,
    viewId: 80,
    name: 'Work',
    containers: COLUMNS,
    mapping: MAPPING,
    kanbanMapping: true,
    ...overrides,
  }
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

function integrationState(boards: VikunjaBoard[]): Extract<IntegrationState, { name: 'vikunja' }> {
  return {
    name: 'vikunja',
    config: {
      baseUrl: 'https://vikunja.example',
      token: 'tk_super-secret-value',
      boards,
      defaultProjectId: boards[0]?.projectId ?? null,
    },
    boardName: null,
    lists: [],
    projects: [],
    mapping: null,
    lastSyncAt: null,
  }
}

function renderStep(boards: VikunjaBoard[], tasks: TodoTask[] = []) {
  render(
    <VikunjaBoardsStep
      onBack={onBack}
      onDone={onDone}
      integration={integrationState(boards)}
      adapter={{ listScopes, listContainers } as unknown as TodoIntegration}
      tasks={tasks}
      errorKey={null}
      actions={{
        setMapping: vi.fn(async () => {}),
        updateIntegrationConfig,
        refreshContainers,
        dropTasksOfProject,
        syncNow,
      }}
    />,
  )
}

async function setup(boards: VikunjaBoard[], tasks: TodoTask[] = []) {
  renderStep(boards, tasks)
  // Every assertion is about the list, which only exists once the account has
  // answered.
  await screen.findByRole('checkbox', { name: 'Work' })
}

/** The config the step tried to persist. */
function written(): { boards: VikunjaBoard[]; defaultProjectId: number | null } {
  return updateIntegrationConfig.mock.calls[0][0] as {
    boards: VikunjaBoard[]
    defaultProjectId: number | null
  }
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name })
const continueButton = () => screen.getByRole('button', { name: `${PREFIX}.continue` })
const stars = () => screen.getAllByRole('button', { name: `${PREFIX}.default` })

beforeEach(() => {
  vi.clearAllMocks()
  listScopes = vi.fn(async () => ({ ok: true as const, value: SCOPES }))
  listContainers = vi.fn(async () => ({ ok: true as const, value: COLUMNS }))
  updateIntegrationConfig = vi.fn<(config: unknown) => boolean>(() => true)
  refreshContainers = vi.fn<() => Promise<boolean>>(async () => true)
  dropTasksOfProject = vi.fn<(projectId: string) => void>()
  syncNow = vi.fn<() => Promise<void>>(async () => {})
  onBack = vi.fn<() => void>()
  onDone = vi.fn<() => void>()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('VikunjaBoardsStep — the list', () => {
  it('offers every project and checks the ones already synced', async () => {
    await setup([board()])

    expect(checkbox('Work')).toHaveProperty('checked', true)
    expect(checkbox('Home')).toHaveProperty('checked', false)
    // The default board says so in words, and only one row does.
    expect(screen.getAllByText(`${PREFIX}.defaultHint`)).toHaveLength(1)
  })

  it('states the account has nothing to offer', async () => {
    listScopes = vi.fn(async () => ({ ok: true as const, value: [] }))
    renderStep([])

    expect(await screen.findByText(`${PREFIX}.empty`)).toBeTruthy()
  })

  it('shows the account’s refusal rather than an empty list', async () => {
    listScopes = vi.fn(async () => ({ ok: false as const, errorKey: 'authInvalid' as const }))
    renderStep([])

    expect(await screen.findByText('integrations.errors.authInvalid')).toBeTruthy()
  })
})

describe('VikunjaBoardsStep — adding a board', () => {
  it('reads the new board’s buckets and keeps the default where it was', async () => {
    await setup([board()])

    await userEvent.click(checkbox('Home'))
    await userEvent.click(continueButton())

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalledTimes(1))
    // Only the new board is read: the one already in the config has its
    // buckets cached.
    expect(listContainers).toHaveBeenCalledTimes(1)
    expect(listContainers).toHaveBeenCalledWith({ projectId: 9, viewId: 90 })

    const config = written()
    expect(config.boards.map((entry) => entry.projectId)).toEqual([8, 9])
    // Unmapped, which is what sends the user to the wizard for it.
    expect(config.boards[1]).toMatchObject({
      projectId: 9,
      viewId: 90,
      name: 'Home',
      containers: COLUMNS,
      mapping: null,
      kanbanMapping: true,
    })
    // Adding a board does not move the star.
    expect(config.defaultProjectId).toBe(8)
    expect(config.boards[0].mapping).toEqual(MAPPING)

    // The widget's projects *are* its boards, so the cache is refreshed.
    await waitFor(() => expect(refreshContainers).toHaveBeenCalledTimes(1))
    // Written and settled: the dialog is handed back its own step machine,
    // which lands on the wizard for the board just added.
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('writes nothing when the new board’s buckets cannot be read', async () => {
    listContainers = vi.fn(async () => ({ ok: false as const, errorKey: 'network' as const }))
    await setup([board()])

    await userEvent.click(checkbox('Home'))
    await userEvent.click(continueButton())

    expect(await screen.findByText('integrations.errors.network')).toBeTruthy()
    expect(updateIntegrationConfig).not.toHaveBeenCalled()
    // Nothing was persisted, so the user stays here to try again.
    expect(onDone).not.toHaveBeenCalled()
  })

  it('still finishes when the projects cache could not be refreshed', async () => {
    refreshContainers.mockResolvedValue(false)
    await setup([board()])

    await userEvent.click(checkbox('Home'))
    await userEvent.click(continueButton())

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalledTimes(1))
    // The boards are persisted; a stale pill cache is the store's own error
    // to report and no reason to keep the user on this screen.
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('moves the default board to the starred one', async () => {
    await setup([board(), board({ projectId: 9, viewId: 90, name: 'Home' })])

    // Second row's star — the first one already has it.
    await userEvent.click(stars()[1])
    await userEvent.click(continueButton())

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalledTimes(1))
    expect(written().defaultProjectId).toBe(9)
    // Nothing was added, so nothing was read.
    expect(listContainers).not.toHaveBeenCalled()
  })
})

describe('VikunjaBoardsStep — dropping a board', () => {
  const home = board({ projectId: 9, viewId: 90, name: 'Home' })

  const tasksOfHome = [
    makeTask({ id: 'a', projectId: '9' }),
    makeTask({ id: 'b', projectId: '9', syncState: 'dirty' }),
    makeTask({ id: 'c', projectId: '8' }),
  ]

  it('asks first, naming the board and what it would cost', async () => {
    await setup([board(), home], tasksOfHome)

    await userEvent.click(checkbox('Home'))
    await userEvent.click(continueButton())

    expect(screen.getByTestId('todo-confirm-dialog')).toBeTruthy()
    expect(screen.getByText(`${PREFIX}.removeTitle`)).toBeTruthy()
    // Two tasks of that board, one of them with a change that never landed —
    // one line each rather than a run-on paragraph.
    expect(screen.getByText(`${PREFIX}.removeBody {"name":"Home","count":2}`)).toBeTruthy()
    expect(screen.getByText(`${PREFIX}.removeDirty {"count":1}`)).toBeTruthy()
    // Nothing has happened yet.
    expect(dropTasksOfProject).not.toHaveBeenCalled()
    expect(updateIntegrationConfig).not.toHaveBeenCalled()
  })

  it('counts a task that only its own ref places on the board', async () => {
    // No `projectId` of its own — the pull wrote the ref, and that is the
    // only thing tying it to this board. The store drops it by the same
    // predicate, so the count here is the count that goes.
    await setup(
      [board(), home],
      [
        makeTask({
          id: 'linked',
          projectId: null,
          remoteRef: {
            taskId: 7,
            projectId: 9,
            identifier: '#7',
            bucketId: null,
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
      ],
    )

    await userEvent.click(checkbox('Home'))
    await userEvent.click(continueButton())

    expect(screen.getByText(`${PREFIX}.removeBody {"name":"Home","count":1}`)).toBeTruthy()
  })

  it('says nothing about unsent changes when there are none', async () => {
    await setup([board(), home], [makeTask({ id: 'a', projectId: '9' })])

    await userEvent.click(checkbox('Home'))
    await userEvent.click(continueButton())

    expect(screen.getByText(`${PREFIX}.removeBody {"name":"Home","count":1}`)).toBeTruthy()
  })

  it('writes the config first and drops the tasks only once it landed', async () => {
    await setup([board(), home], tasksOfHome)

    await userEvent.click(checkbox('Home'))
    await userEvent.click(continueButton())
    await userEvent.click(screen.getByTestId('todo-confirm-accept'))

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalledTimes(1))
    expect(dropTasksOfProject).toHaveBeenCalledWith('9')
    // The order matters: the config write is the one that can be refused,
    // and tasks dropped for a board that then stayed would be gone for
    // nothing.
    expect(updateIntegrationConfig.mock.invocationCallOrder[0]).toBeLessThan(
      dropTasksOfProject.mock.invocationCallOrder[0],
    )
    expect(written().boards.map((entry) => entry.projectId)).toEqual([8])
  })

  it('keeps the tasks when the config write is refused', async () => {
    updateIntegrationConfig.mockReturnValue(false)
    await setup([board(), home], tasksOfHome)

    await userEvent.click(checkbox('Home'))
    await userEvent.click(continueButton())
    await userEvent.click(screen.getByTestId('todo-confirm-accept'))

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalledTimes(1))
    // The board is still in the config, so its tasks still have a board.
    expect(dropTasksOfProject).not.toHaveBeenCalled()
    expect(refreshContainers).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('re-points the default board when the starred one is the one dropped', async () => {
    // 'Work' is the default; dropping it leaves 'Home' as the only board.
    await setup([board(), home])

    await userEvent.click(checkbox('Work'))
    await userEvent.click(continueButton())
    await userEvent.click(screen.getByTestId('todo-confirm-accept'))

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalledTimes(1))
    expect(written().defaultProjectId).toBe(9)
  })

  it('does nothing at all when the question is dismissed', async () => {
    await setup([board(), home], tasksOfHome)

    await userEvent.click(checkbox('Home'))
    await userEvent.click(continueButton())
    await userEvent.click(screen.getByRole('button', { name: 'integrations.actions.cancel' }))

    expect(dropTasksOfProject).not.toHaveBeenCalled()
    expect(updateIntegrationConfig).not.toHaveBeenCalled()
    // The board is still unchecked — the user may confirm or re-check it.
    expect(checkbox('Home')).toHaveProperty('checked', false)
  })

  it('refuses to leave the connection with no board at all', async () => {
    await setup([board()])

    await userEvent.click(checkbox('Work'))

    expect(continueButton()).toHaveProperty('disabled', true)
    expect(screen.getByText(`${PREFIX}.keepOne`)).toBeTruthy()
  })
})

describe('VikunjaBoardsStep — leaving', () => {
  it('hands "Back" to the dialog rather than deciding itself', async () => {
    await setup([board()])

    await userEvent.click(screen.getByRole('button', { name: 'integrations.actions.back' }))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(updateIntegrationConfig).not.toHaveBeenCalled()
  })
})
