// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendVikunjaMessage } from '@/widgets/Todo/integrations/vikunja/bridge.ts'
import { VikunjaMappingStep } from '@/widgets/Todo/integrations/vikunja/VikunjaMappingStep.tsx'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'

import type { RemoteContainer, StatusListMapping } from '@/widgets/Todo/integrations/types.ts'
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

vi.mock('@/widgets/Todo/integrations/vikunja/bridge.ts', () => ({
  sendVikunjaMessage: vi.fn(),
}))

// The store persists on every `set`; keep storage inert in jsdom.
vi.mock('@/services/chrome/storage.ts', () => ({
  getArea: vi.fn(async () => null),
  setArea: vi.fn(async () => true),
  removeArea: vi.fn(async () => true),
  getLocal: vi.fn(async () => null),
  setLocal: vi.fn(async () => true),
}))

const bridge = vi.mocked(sendVikunjaMessage)

const PREFIX = 'integrations.vikunja.mapping'

/** The board the acceptance criterion names: To-Do / Doing / Done. */
const THREE_COLUMNS: RemoteContainer[] = [
  { id: '1', name: 'To-Do' },
  { id: '2', name: 'Doing' },
  { id: '3', name: 'Done', isTerminal: true },
]

const CREATED_COLUMNS: RemoteContainer[] = [
  { id: '4', name: 'Struggle' },
  { id: '5', name: 'Trash' },
]

// Typed as the store's own actions: they are written straight back into the
// store, so a drifting signature has to fail here rather than at runtime.
let setMapping: Mock<(mapping: StatusListMapping) => Promise<void>>
let updateIntegrationConfig: Mock<(config: unknown) => void>
let refreshContainers: Mock<() => Promise<void>>

function integrationState(overrides: Partial<Extract<IntegrationState, { name: 'vikunja' }>> = {}) {
  return {
    name: 'vikunja' as const,
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

function setup(overrides: Partial<Extract<IntegrationState, { name: 'vikunja' }>> = {}) {
  setMapping = vi.fn<(mapping: StatusListMapping) => Promise<void>>(async () => {})
  updateIntegrationConfig = vi.fn<(config: unknown) => void>(() => {})
  // Stands in for the real action: re-reads the buckets into the slice.
  refreshContainers = vi.fn(async () => {
    useTodoStore.setState((state) => ({
      integration: state.integration
        ? { ...state.integration, lists: [...THREE_COLUMNS, ...CREATED_COLUMNS] }
        : null,
    }))
  })

  useTodoStore.setState({
    tasks: [],
    integration: integrationState(overrides),
    loading: false,
    errorKey: null,
    setMapping,
    updateIntegrationConfig,
    refreshContainers,
  })

  render(<VikunjaMappingStep onBack={vi.fn()} />)
}

const saveButton = () => screen.getByRole('button', { name: 'integrations.trello.mapping.save' })
const createButton = () => screen.getByRole('button', { name: `${PREFIX}.createButton {"n":2}` })
const skipButton = () => screen.getByRole('button', { name: `${PREFIX}.skipFlat` })

beforeEach(() => {
  bridge.mockReset()
})

afterEach(() => {
  cleanup()
  useTodoStore.setState({ tasks: [], integration: null, loading: false, errorKey: null })
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

  it('creates the columns one at a time and completes the draft', async () => {
    setup()
    bridge.mockImplementation(async (req) =>
      req.op === 'createBucket'
        ? {
            ok: true,
            value: {
              id: req.title.endsWith('columnStruggle') ? 4 : 5,
              title: req.title,
              isDone: false,
            },
          }
        : { ok: false, errorKey: 'unknown' },
    )

    await userEvent.click(createButton())

    await waitFor(() => expect(refreshContainers).toHaveBeenCalledTimes(1))

    const created = bridge.mock.calls.map(([req]) => req).filter((req) => req.op === 'createBucket')
    expect(created).toHaveLength(2)
    expect(created.map((req) => (req.op === 'createBucket' ? req.title : null))).toEqual([
      `${PREFIX}.columnStruggle`,
      `${PREFIX}.columnTrash`,
    ])

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

  it('reports a failed creation and leaves the panel up', async () => {
    setup()
    bridge.mockResolvedValue({ ok: false, errorKey: 'authInvalid' })

    await userEvent.click(createButton())

    await waitFor(() => expect(screen.getByText('integrations.errors.authInvalid')).toBeTruthy())
    expect(refreshContainers).not.toHaveBeenCalled()
    expect(screen.getByText(`${PREFIX}.createMissingTitle`)).toBeTruthy()
  })

  it('falls back to flat mode when the user skips', async () => {
    setup()

    await userEvent.click(skipButton())

    await waitFor(() => expect(setMapping).toHaveBeenCalledTimes(1))
    expect(updateIntegrationConfig).toHaveBeenCalledWith(
      expect.objectContaining({ kanbanMapping: false }),
    )
    expect(setMapping).toHaveBeenCalledWith({
      input: ['1'],
      inprogress: ['1'],
      struggle: ['1'],
      completed: ['3'],
      deleted: ['1'],
    })
    // No column was created on the user's instance.
    expect(bridge).not.toHaveBeenCalled()
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

  it('blocks the save when the trash points at the done bucket', () => {
    setup({ lists: fullBoard, mapping: { ...complete, deleted: ['3'] } })

    expect(screen.getByText(`${PREFIX}.deletedOnTerminal`)).toBeTruthy()
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('needs an explicit confirmation when completed misses the done bucket', async () => {
    // `completed` on a plain column, and nothing else wrong: the done bucket
    // is used for `struggle`, which is odd but not an error.
    setup({ lists: fullBoard, mapping: { ...complete, struggle: ['3'], completed: ['4'] } })

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

  it('starts from a fresh suggestion instead of the flat placeholder', () => {
    setup({ mapping: flat, config: { ...integrationState().config, kanbanMapping: false } })

    // The flat mapping would read as four conflicts; the user sees the
    // suggestion and the create-columns offer instead.
    expect(screen.queryByText(`${PREFIX}.conflict`)).toBeNull()
    expect(screen.getByText(`${PREFIX}.createMissingTitle`)).toBeTruthy()
    // And the notice that flat mode is what is currently active.
    expect(screen.getAllByText(`${PREFIX}.flatNotice`).length).toBeGreaterThan(0)
  })

  it('leaves flat mode behind when a real mapping is saved', async () => {
    setup({
      lists: [...THREE_COLUMNS, ...CREATED_COLUMNS],
      mapping: flat,
      config: { ...integrationState().config, kanbanMapping: false },
    })

    await userEvent.click(saveButton())

    expect(updateIntegrationConfig).toHaveBeenCalledWith(
      expect.objectContaining({ kanbanMapping: true }),
    )
    expect(setMapping).toHaveBeenCalledWith(
      expect.objectContaining({ struggle: ['4'], deleted: ['5'] }),
    )
  })
})
