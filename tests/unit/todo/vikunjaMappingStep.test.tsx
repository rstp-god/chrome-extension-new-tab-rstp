// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VikunjaMappingStep } from '@/widgets/Todo/integrations/vikunja/VikunjaMappingStep.tsx'

import type {
  IntegrationOutcome,
  RemoteContainer,
  StatusListMapping,
  TodoIntegration,
} from '@/widgets/Todo/integrations/types.ts'
import type { IntegrationState, VikunjaBoard } from '@/widgets/Todo/store/store.ts'
import type { Mock } from 'vitest'

/** Keys, not prose — `tests/contracts/i18nKeys.test.ts` guards the copy. */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { t: (key: string) => key, changeLanguage: async () => {} },
  }),
}))

const PREFIX = 'integrations.vikunja.mapping'
const SCOPE = { projectId: 1, viewId: 4 }

/** The board the acceptance criterion names: To-Do / Doing / Done. */
const THREE_COLUMNS: RemoteContainer[] = [
  { id: '1', name: 'To-Do', isDefault: true },
  { id: '2', name: 'Doing' },
  { id: '3', name: 'Done', isTerminal: true },
]

const CREATED_COLUMNS: RemoteContainer[] = [
  { id: '4', name: 'Struggle' },
  { id: '5', name: 'Trash' },
]

type VikunjaSlice = Extract<IntegrationState, { name: 'vikunja' }>

// Typed as the store's own actions: they are handed straight to the step, so
// a drifting signature has to fail here rather than at runtime.
let setMapping: Mock<(mapping: StatusListMapping) => Promise<void>>
let updateIntegrationConfig: Mock<(config: unknown) => boolean>
let refreshContainers: Mock<() => Promise<boolean>>
let dropTasksOfProject: Mock<(projectId: string) => void>
let createContainer: Mock<
  (scope: unknown, title: string) => Promise<IntegrationOutcome<RemoteContainer>>
>
let listContainers: Mock<(scope: unknown) => Promise<IntegrationOutcome<RemoteContainer[]>>>
let onBack: Mock<() => void>

/**
 * What the step reads: the board's own buckets, mapping and mode. The slice
 * fields around them are empty, which is what the store writes for this
 * backend — a step reading them would show the user nothing.
 */
type BoardOverrides = Partial<Pick<VikunjaBoard, 'containers' | 'mapping' | 'kanbanMapping'>>

const BOARD: VikunjaBoard = {
  projectId: 1,
  viewId: 4,
  name: 'Inbox',
  containers: THREE_COLUMNS,
  mapping: null,
  kanbanMapping: true,
}

function integrationState(board: BoardOverrides = {}): VikunjaSlice {
  return {
    name: 'vikunja',
    config: {
      baseUrl: 'https://vikunja.example',
      token: 'tk_super-secret-value',
      boards: [{ ...BOARD, ...board }],
      defaultProjectId: 1,
    },
    boardName: null,
    lists: [],
    projects: [],
    mapping: null,
    lastSyncAt: null,
  }
}

/** Answers with the bucket id the test asked for, keyed by the i18n title. */
function creates(ids: Partial<Record<string, number | 'fail'>>) {
  createContainer.mockImplementation(async (_scope, title) => {
    const id = title.endsWith('columnStruggle') ? ids.struggle : ids.trash
    if (id === undefined || id === 'fail') return { ok: false, errorKey: 'authInvalid' }
    return { ok: true, value: { id: String(id), name: title } }
  })
}

/** The whole slice, for the tests that need more than one board. */
function setupBoards(boards: VikunjaBoard[], target?: string, withCreate = true) {
  const integration: VikunjaSlice = {
    ...integrationState(),
    config: {
      baseUrl: 'https://vikunja.example',
      token: 'tk_super-secret-value',
      boards,
      defaultProjectId: boards[0]?.projectId ?? null,
    },
  }
  const adapter = {
    listContainers,
    ...(withCreate ? { createContainer } : {}),
  } as unknown as TodoIntegration

  render(
    <VikunjaMappingStep
      onBack={onBack}
      integration={integration}
      adapter={adapter}
      scope={SCOPE}
      errorKey={null}
      target={target}
      actions={{ setMapping, updateIntegrationConfig, refreshContainers, dropTasksOfProject }}
    />,
  )
}

function setup(board: BoardOverrides = {}, withCreate = true) {
  setupBoards([{ ...BOARD, ...board }], undefined, withCreate)
}

/** The mapping the step wrote onto the board with that id, if any. */
function savedBoard(projectId: number): Partial<VikunjaBoard> | undefined {
  const calls = updateIntegrationConfig.mock.calls
  const last = calls[calls.length - 1]?.[0] as { boards?: VikunjaBoard[] } | undefined
  return last?.boards?.find((board) => board.projectId === projectId)
}

const saveButton = () => screen.getByRole('button', { name: 'integrations.mapping.save' })
const createButton = () => screen.getByRole('button', { name: `${PREFIX}.createButton {"n":2}` })
const skipButton = () => screen.getByRole('button', { name: `${PREFIX}.skipFlat` })

beforeEach(() => {
  vi.clearAllMocks()
  setMapping = vi.fn<(mapping: StatusListMapping) => Promise<void>>(async () => {})
  updateIntegrationConfig = vi.fn<(config: unknown) => boolean>(() => true)
  refreshContainers = vi.fn<() => Promise<boolean>>(async () => true)
  dropTasksOfProject = vi.fn<(projectId: string) => void>()
  createContainer = vi.fn()
  onBack = vi.fn<() => void>()
  // What the step re-reads for itself after creating a column: the default
  // board's `refreshContainers` cannot answer for the board on screen.
  listContainers = vi.fn(async () => ({
    ok: true as const,
    value: [...THREE_COLUMNS, ...CREATED_COLUMNS],
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('VikunjaMappingStep — a three-column board', () => {
  it('offers exactly the two columns the board is missing', () => {
    setup()

    expect(screen.getByText(`${PREFIX}.createMissingTitle`)).toBeTruthy()
    expect(screen.getByText(`${PREFIX}.columnStruggle`)).toBeTruthy()
    expect(screen.getByText(`${PREFIX}.columnTrash`)).toBeTruthy()
    // Two, per the button's interpolated count.
    expect(createButton()).toBeTruthy()
    // Nothing can be saved while two rows are empty.
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('hides the create panel when the adapter cannot create containers', () => {
    setup({}, false)

    expect(screen.queryByText(`${PREFIX}.createMissingTitle`)).toBeNull()
    // Flat mode is still on offer — it needs nothing from the backend.
    expect(skipButton()).toBeTruthy()
  })

  it('creates the columns one at a time and completes the draft', async () => {
    setup()
    creates({ struggle: 4, trash: 5 })

    await userEvent.click(createButton())

    // Re-read by the step itself: `refreshContainers` answers for the default
    // board, which is not necessarily the one being mapped.
    await waitFor(() => expect(listContainers).toHaveBeenCalledTimes(1))
    expect(refreshContainers).not.toHaveBeenCalled()
    expect(createContainer).toHaveBeenCalledTimes(2)
    expect(createContainer.mock.calls.map(([, title]) => title)).toEqual([
      `${PREFIX}.columnStruggle`,
      `${PREFIX}.columnTrash`,
    ])
    expect(createContainer.mock.calls[0][0]).toEqual(SCOPE)

    // The panel is gone and the mapping is now savable.
    expect(screen.queryByText(`${PREFIX}.createMissingTitle`)).toBeNull()
    expect(screen.getByText(`${PREFIX}.created`)).toBeTruthy()
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))

    await userEvent.click(saveButton())
    // The mapping is written onto the board, never through `setMapping` —
    // which would land on the default board whatever is on screen.
    expect(savedBoard(1)).toMatchObject({
      kanbanMapping: true,
      mapping: {
        input: ['1'],
        inprogress: ['2'],
        struggle: ['4'],
        completed: ['3'],
        deleted: ['5'],
      },
    })
    expect(setMapping).not.toHaveBeenCalled()
  })

  it('keeps the columns it did create when a later one fails', async () => {
    setup()
    creates({ struggle: 4, trash: 'fail' })

    await userEvent.click(createButton())

    // The first bucket exists on the instance now, so the widget must know
    // about it — otherwise a retry would create a second copy.
    await waitFor(() => expect(listContainers).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('integrations.errors.authInvalid')).toBeTruthy()
    expect(screen.queryByText(`${PREFIX}.created`)).toBeNull()

    // Only the trash is still missing, so the panel now offers one column.
    const retry = screen.getByRole('button', { name: `${PREFIX}.createButton {"n":1}` })
    creates({ trash: 5 })
    await userEvent.click(retry)

    await waitFor(() => expect(createContainer).toHaveBeenCalledTimes(3))
    expect(createContainer.mock.calls[2][1]).toBe(`${PREFIX}.columnTrash`)
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))

    await userEvent.click(saveButton())
    expect(savedBoard(1)?.mapping).toMatchObject({ struggle: ['4'], deleted: ['5'] })
  })

  it('falls back to flat mode when the user skips', async () => {
    setup()

    await userEvent.click(skipButton())

    // The mode and the mapping belong to the board, and land in one write:
    // either would be wrong without the other.
    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalledTimes(1))
    expect(savedBoard(1)).toMatchObject({
      kanbanMapping: false,
      // Everything but `completed` goes to the view's default bucket.
      mapping: {
        input: ['1'],
        inprogress: ['1'],
        struggle: ['1'],
        completed: ['3'],
        deleted: ['1'],
      },
    })
    // No column was created on the user's instance.
    expect(createContainer).not.toHaveBeenCalled()
  })

  it('stays on the board when the config write was refused', async () => {
    setup()
    updateIntegrationConfig.mockReturnValue(false)

    await userEvent.click(skipButton())

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalled())
    // Nothing was persisted, so the wizard has no business moving on.
    expect(onBack).not.toHaveBeenCalled()
  })
})

describe('VikunjaMappingStep — validation', () => {
  const complete: StatusListMapping = {
    input: ['1'],
    inprogress: ['2'],
    struggle: ['4'],
    completed: ['3'],
    deleted: ['5'],
  }

  const fullBoard = [...THREE_COLUMNS, ...CREATED_COLUMNS]

  it('saves a complete, conflict-free mapping', async () => {
    setup({ containers: fullBoard, mapping: complete })

    expect(screen.queryByText(`${PREFIX}.conflict`)).toBeNull()
    await userEvent.click(saveButton())

    expect(savedBoard(1)).toMatchObject({ kanbanMapping: true, mapping: complete })
    // One board, nothing left in the queue: the dialog recomputes its step.
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('blocks the save on a conflict', () => {
    setup({ containers: fullBoard, mapping: { ...complete, struggle: ['2'] } })

    expect(screen.getByText(`${PREFIX}.conflict`)).toBeTruthy()
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('blocks the save and names every status put on the done bucket', () => {
    setup({
      containers: fullBoard,
      mapping: { ...complete, inprogress: ['3'], deleted: ['3'] },
    })

    expect(
      screen.getByText(
        `${PREFIX}.terminalMisused {"statuses":"integrations.mapping.row.inprogress, integrations.mapping.row.deleted"}`,
      ),
    ).toBeTruthy()
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('says nothing about the done bucket on a board that has none', () => {
    setup({ containers: fullBoard.map(({ id, name }) => ({ id, name })), mapping: complete })

    expect(screen.queryByText(`${PREFIX}.completedNotTerminal`)).toBeNull()
    expect(saveButton()).toHaveProperty('disabled', false)
  })

  it('needs an explicit confirmation when completed misses the done bucket', async () => {
    // Every row filled, no conflict, the done bucket left out of all of
    // them — the one shape where this is a warning rather than an error.
    setup({
      containers: [...fullBoard, { id: '6', name: 'Icebox' }],
      mapping: {
        input: ['1'],
        inprogress: ['2'],
        struggle: ['4'],
        completed: ['5'],
        deleted: ['6'],
      },
    })

    expect(screen.getByText(`${PREFIX}.completedNotTerminal`)).toBeTruthy()
    expect(saveButton()).toHaveProperty('disabled', true)

    await userEvent.click(screen.getByRole('switch'))

    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
  })
})

describe('VikunjaMappingStep — coming back from flat mode', () => {
  const flat: StatusListMapping = {
    input: ['1'],
    inprogress: ['1'],
    struggle: ['1'],
    completed: ['3'],
    deleted: ['1'],
  }

  function flatBoard(overrides: BoardOverrides = {}): BoardOverrides {
    return { mapping: flat, kanbanMapping: false, ...overrides }
  }

  it('starts from a fresh suggestion and says flat mode is in effect', () => {
    setup(flatBoard())

    // The flat mapping would read as four conflicts; the user sees the
    // suggestion and the create-columns offer instead.
    expect(screen.queryByText(`${PREFIX}.conflict`)).toBeNull()
    expect(screen.getByText(`${PREFIX}.createMissingTitle`)).toBeTruthy()
    expect(screen.getByText(`${PREFIX}.flatActive`)).toBeTruthy()
    // Already flat: no point offering it again.
    expect(screen.queryByRole('button', { name: `${PREFIX}.skipFlat` })).toBeNull()
  })

  it('leaves flat mode behind when a real mapping is saved', async () => {
    setup(flatBoard({ containers: [...THREE_COLUMNS, ...CREATED_COLUMNS] }))

    await userEvent.click(saveButton())

    expect(savedBoard(1)).toMatchObject({ kanbanMapping: true })
    expect(savedBoard(1)?.mapping).toMatchObject({ struggle: ['4'], deleted: ['5'] })
  })

  it('does not move on when leaving flat mode is refused', async () => {
    setup(flatBoard({ containers: [...THREE_COLUMNS, ...CREATED_COLUMNS] }))
    updateIntegrationConfig.mockReturnValue(false)

    await userEvent.click(saveButton())

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalled())
    expect(onBack).not.toHaveBeenCalled()
  })
})

describe('VikunjaMappingStep — several boards', () => {
  const complete: StatusListMapping = {
    input: ['1'],
    inprogress: ['2'],
    struggle: ['4'],
    completed: ['3'],
    deleted: ['5'],
  }

  const FULL_BOARD = [...THREE_COLUMNS, ...CREATED_COLUMNS]

  /** A second board whose columns are named the same but numbered per board. */
  const SECOND_COLUMNS: RemoteContainer[] = [
    { id: '11', name: 'To-Do', isDefault: true },
    { id: '12', name: 'doing ' },
    { id: '13', name: 'Done', isTerminal: true },
    { id: '14', name: 'Struggle' },
    { id: '15', name: 'Trash' },
  ]

  function board(overrides: Partial<VikunjaBoard>): VikunjaBoard {
    return { ...BOARD, ...overrides }
  }

  const header = (n: number, total: number, name: string) =>
    `${PREFIX}.boardHeader {"n":${n},"total":${total},"name":"${name}"}`

  it('walks the unmapped boards in order and hands back after the last', async () => {
    setupBoards([
      board({ projectId: 1, name: 'Work', containers: FULL_BOARD }),
      board({ projectId: 2, viewId: 5, name: 'Home', containers: SECOND_COLUMNS }),
    ])

    expect(screen.getByText(header(1, 2, 'Work'))).toBeTruthy()
    await userEvent.click(saveButton())

    // The first board's answer is written on the first board…
    expect(savedBoard(1)?.mapping).toMatchObject({ input: ['1'], completed: ['3'] })
    expect(onBack).not.toHaveBeenCalled()

    // …and the wizard moves on rather than asking one question for both.
    expect(screen.getByText(header(2, 2, 'Home'))).toBeTruthy()
    await userEvent.click(saveButton())

    expect(savedBoard(2)?.mapping).toMatchObject({ input: ['11'], completed: ['13'] })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows only the board the summary named', async () => {
    setupBoards(
      [
        board({ projectId: 1, name: 'Work', containers: FULL_BOARD, mapping: complete }),
        board({ projectId: 2, viewId: 5, name: 'Home', containers: SECOND_COLUMNS }),
      ],
      '2',
    )

    // Named explicitly, so the header says which board even though it is one.
    expect(screen.getByText(header(1, 1, 'Home'))).toBeTruthy()
    await userEvent.click(saveButton())

    expect(savedBoard(1)?.mapping).toEqual(complete)
    expect(savedBoard(2)?.mapping).toMatchObject({ input: ['11'] })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('says nothing about boards when there is one and nobody named it', () => {
    setup({ containers: FULL_BOARD, mapping: complete })

    expect(screen.queryByText(header(1, 1, 'Inbox'))).toBeNull()
  })

  it('copies the other board’s mapping by column name', async () => {
    setupBoards([
      board({ projectId: 1, name: 'Work', containers: FULL_BOARD, mapping: complete }),
      board({ projectId: 2, viewId: 5, name: 'Home', containers: SECOND_COLUMNS }),
    ])

    const copy = screen.getByRole('button', { name: `${PREFIX}.copyFrom {"name":"Work"}` })
    await userEvent.click(copy)
    await userEvent.click(saveButton())

    // Matched by name (case and spacing ignored), with the ids of *this* board.
    expect(savedBoard(2)?.mapping).toEqual({
      input: ['11'],
      inprogress: ['12'],
      struggle: ['14'],
      completed: ['13'],
      deleted: ['15'],
    })
  })

  it('reports what the copy could not fill, for the create-columns panel', async () => {
    setupBoards([
      board({ projectId: 1, name: 'Work', containers: FULL_BOARD, mapping: complete }),
      board({ projectId: 2, viewId: 5, name: 'Home', containers: THREE_COLUMNS }),
    ])

    await userEvent.click(
      screen.getByRole('button', { name: `${PREFIX}.copyFrom {"name":"Work"}` }),
    )

    // This board has no struggle/trash column, so the copy leaves those rows
    // empty — exactly what the panel offers to build.
    expect(screen.getByText(`${PREFIX}.createMissingTitle`)).toBeTruthy()
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('offers no copy while no other board has been mapped', () => {
    setupBoards([
      board({ projectId: 1, name: 'Work', containers: FULL_BOARD }),
      board({ projectId: 2, viewId: 5, name: 'Home', containers: SECOND_COLUMNS }),
    ])

    expect(screen.queryByRole('button', { name: `${PREFIX}.copyFrom {"name":"Home"}` })).toBeNull()
  })

  it('takes one board into flat mode and leaves the other alone', async () => {
    setupBoards([
      board({ projectId: 1, name: 'Work', containers: FULL_BOARD }),
      board({ projectId: 2, viewId: 5, name: 'Home', containers: SECOND_COLUMNS }),
    ])

    // Board 1 gets a real mapping…
    await userEvent.click(saveButton())
    expect(savedBoard(1)).toMatchObject({ kanbanMapping: true })

    // …board 2 gets flat mode, which is a per-board choice.
    await userEvent.click(skipButton())

    expect(savedBoard(2)).toMatchObject({ kanbanMapping: false })
    expect(savedBoard(1)).toMatchObject({ kanbanMapping: true })
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
