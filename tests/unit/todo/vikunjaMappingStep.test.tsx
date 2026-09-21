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
import type { IntegrationState } from '@/widgets/Todo/store/store.ts'
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
let createContainer: Mock<
  (scope: unknown, title: string) => Promise<IntegrationOutcome<RemoteContainer>>
>

function integrationState(overrides: Partial<VikunjaSlice> = {}): VikunjaSlice {
  return {
    name: 'vikunja',
    config: {
      baseUrl: 'https://vikunja.example',
      token: 'tk_super-secret-value',
      projectId: 1,
      viewId: 4,
      kanbanMapping: true,
    },
    boardName: 'Inbox',
    lists: THREE_COLUMNS,
    projects: [],
    mapping: null,
    lastSyncAt: null,
    ...overrides,
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

function setup(overrides: Partial<VikunjaSlice> = {}, withCreate = true) {
  setMapping = vi.fn<(mapping: StatusListMapping) => Promise<void>>(async () => {})
  updateIntegrationConfig = vi.fn<(config: unknown) => boolean>(() => true)
  createContainer = vi.fn()
  // Stands in for the real action: re-reads the buckets into the slice.
  refreshContainers = vi.fn<() => Promise<boolean>>(async () => true)

  const integration = integrationState(overrides)
  const adapter = {
    ...(withCreate ? { createContainer } : {}),
  } as unknown as TodoIntegration

  render(
    <VikunjaMappingStep
      onBack={vi.fn()}
      integration={integration}
      adapter={adapter}
      scope={SCOPE}
      errorKey={null}
      actions={{ setMapping, updateIntegrationConfig, refreshContainers }}
    />,
  )
}

const saveButton = () => screen.getByRole('button', { name: 'integrations.mapping.save' })
const createButton = () => screen.getByRole('button', { name: `${PREFIX}.createButton {"n":2}` })
const skipButton = () => screen.getByRole('button', { name: `${PREFIX}.skipFlat` })

beforeEach(() => {
  vi.clearAllMocks()
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

    await waitFor(() => expect(refreshContainers).toHaveBeenCalledTimes(1))
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
    expect(setMapping).toHaveBeenCalledWith({
      input: ['1'],
      inprogress: ['2'],
      struggle: ['4'],
      completed: ['3'],
      deleted: ['5'],
    })
  })

  it('keeps the columns it did create when a later one fails', async () => {
    setup()
    creates({ struggle: 4, trash: 'fail' })

    await userEvent.click(createButton())

    // The first bucket exists on the instance now, so the widget must know
    // about it — otherwise a retry would create a second copy.
    await waitFor(() => expect(refreshContainers).toHaveBeenCalledTimes(1))
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
    expect(setMapping).toHaveBeenCalledWith(
      expect.objectContaining({ struggle: ['4'], deleted: ['5'] }),
    )
  })

  it('falls back to flat mode when the user skips', async () => {
    setup()

    await userEvent.click(skipButton())

    await waitFor(() => expect(setMapping).toHaveBeenCalledTimes(1))
    expect(updateIntegrationConfig).toHaveBeenCalledWith(
      expect.objectContaining({ kanbanMapping: false }),
    )
    // Everything but `completed` goes to the view's default bucket.
    expect(setMapping).toHaveBeenCalledWith({
      input: ['1'],
      inprogress: ['1'],
      struggle: ['1'],
      completed: ['3'],
      deleted: ['1'],
    })
    // No column was created on the user's instance.
    expect(createContainer).not.toHaveBeenCalled()
  })

  it('does not save a flat mapping when the config write was refused', async () => {
    setup()
    updateIntegrationConfig.mockReturnValue(false)

    await userEvent.click(skipButton())

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalled())
    expect(setMapping).not.toHaveBeenCalled()
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
    setup({ lists: fullBoard, mapping: complete })

    expect(screen.queryByText(`${PREFIX}.conflict`)).toBeNull()
    await userEvent.click(saveButton())

    expect(setMapping).toHaveBeenCalledWith(complete)
    // Already kanban, so the config is left alone.
    expect(updateIntegrationConfig).not.toHaveBeenCalled()
  })

  it('blocks the save on a conflict', () => {
    setup({ lists: fullBoard, mapping: { ...complete, struggle: ['2'] } })

    expect(screen.getByText(`${PREFIX}.conflict`)).toBeTruthy()
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('blocks the save and names every status put on the done bucket', () => {
    setup({
      lists: fullBoard,
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
    setup({ lists: fullBoard.map(({ id, name }) => ({ id, name })), mapping: complete })

    expect(screen.queryByText(`${PREFIX}.completedNotTerminal`)).toBeNull()
    expect(saveButton()).toHaveProperty('disabled', false)
  })

  it('needs an explicit confirmation when completed misses the done bucket', async () => {
    // Every row filled, no conflict, the done bucket left out of all of
    // them — the one shape where this is a warning rather than an error.
    setup({
      lists: [...fullBoard, { id: '6', name: 'Icebox' }],
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

  function flatSlice(overrides: Partial<VikunjaSlice> = {}) {
    return {
      mapping: flat,
      config: { ...integrationState().config, kanbanMapping: false },
      ...overrides,
    }
  }

  it('starts from a fresh suggestion and says flat mode is in effect', () => {
    setup(flatSlice())

    // The flat mapping would read as four conflicts; the user sees the
    // suggestion and the create-columns offer instead.
    expect(screen.queryByText(`${PREFIX}.conflict`)).toBeNull()
    expect(screen.getByText(`${PREFIX}.createMissingTitle`)).toBeTruthy()
    expect(screen.getByText(`${PREFIX}.flatActive`)).toBeTruthy()
    // Already flat: no point offering it again.
    expect(screen.queryByRole('button', { name: `${PREFIX}.skipFlat` })).toBeNull()
  })

  it('leaves flat mode behind when a real mapping is saved', async () => {
    setup(flatSlice({ lists: [...THREE_COLUMNS, ...CREATED_COLUMNS] }))

    await userEvent.click(saveButton())

    expect(updateIntegrationConfig).toHaveBeenCalledWith(
      expect.objectContaining({ kanbanMapping: true }),
    )
    expect(setMapping).toHaveBeenCalledWith(
      expect.objectContaining({ struggle: ['4'], deleted: ['5'] }),
    )
  })

  it('does not save the mapping when leaving flat mode is refused', async () => {
    setup(flatSlice({ lists: [...THREE_COLUMNS, ...CREATED_COLUMNS] }))
    updateIntegrationConfig.mockReturnValue(false)

    await userEvent.click(saveButton())

    await waitFor(() => expect(updateIntegrationConfig).toHaveBeenCalled())
    expect(setMapping).not.toHaveBeenCalled()
  })
})
