// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { IntegrationState } from '@/widgets/Todo/store/store.ts'

/**
 * What "Back" means on the scope picker, which is reachable two ways: from
 * the summary ("Change board / project"), where it is a cancel, and right
 * after connecting, where there is nothing behind it but the picker.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { t: (key: string) => key, changeLanguage: async () => {} },
  }),
}))

vi.mock('@/services/chrome/storage.ts', () => ({
  getArea: vi.fn(async () => null),
  setArea: vi.fn(async () => true),
  removeArea: vi.fn(async () => true),
  getLocal: vi.fn(async () => null),
  setLocal: vi.fn(async () => true),
}))

const fakeListScopes = vi.hoisted(() => vi.fn())
const fakeListContainers = vi.hoisted(() => vi.fn())
const fakeListProjects = vi.hoisted(() => vi.fn())
const fakeCreateContainer = vi.hoisted(() => vi.fn())

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
          listScopes: fakeListScopes,
          listContainers: fakeListContainers,
          listProjects: fakeListProjects,
          createContainer: fakeCreateContainer,
          pullTasks: vi.fn(async () => ({ ok: true, value: { tasks: [], refs: {} } })),
          pushTask: vi.fn(),
        }),
      }
    },
  }
})

import { TodoSettingsDialog } from '@/widgets/Todo/components/settings/TodoSettingsDialog.tsx'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'

/** Named so `suggestMapping` fills every row without the user touching it. */
const FULL_COLUMNS = [
  { id: '1', name: 'To-Do', isDefault: true },
  { id: '2', name: 'Doing' },
  { id: '4', name: 'Struggle' },
  { id: '3', name: 'Done', isTerminal: true },
  { id: '5', name: 'Trash' },
]

const MAPPING = {
  input: ['1'],
  inprogress: ['1'],
  struggle: ['1'],
  completed: ['3'],
  deleted: ['1'],
}

function vikunja(overrides: Partial<Extract<IntegrationState, { name: 'vikunja' }>> = {}) {
  return {
    name: 'vikunja' as const,
    config: {
      baseUrl: 'https://vikunja.example',
      token: 'tk',
      boards: [
        {
          projectId: 1,
          viewId: 4,
          name: 'Probe',
          containers: [
            { id: '1', name: 'To-Do', isDefault: true },
            { id: '3', name: 'Done', isTerminal: true },
          ],
          mapping: MAPPING,
          kanbanMapping: true,
        },
      ],
      defaultProjectId: 1,
    },
    // Dead for this backend: the board above holds all three.
    boardName: null,
    lists: [],
    projects: [],
    mapping: null,
    lastSyncAt: null,
    ...overrides,
  }
}

/** The same connection with the board's wizard unfinished. */
function unmapped() {
  const base = vikunja()
  return {
    ...base,
    config: { ...base.config, boards: [{ ...base.config.boards[0], mapping: null }] },
  }
}

const back = () => screen.getByRole('button', { name: 'integrations.actions.back' })

/**
 * Vikunja brings its own scope step — the multi-select of boards — so "is the
 * user on the scope step" is that step's own marker rather than the generic
 * picker's select.
 */
const onScopePicker = () => screen.queryByTestId('todo-boards-step') !== null

async function click(element: HTMLElement) {
  await act(async () => {
    await userEvent.click(element)
  })
}

async function open(integration: IntegrationState) {
  useTodoStore.setState({
    integration,
    tasks: [],
    loading: false,
    errorKey: null,
    conflictTaskIds: [],
  })
  await act(async () => {
    render(<TodoSettingsDialog open onOpenChange={vi.fn()} />)
  })
}

beforeEach(() => {
  fakeListScopes.mockReset()
  fakeListContainers.mockReset()
  fakeListProjects.mockReset()
  fakeCreateContainer.mockReset()
  fakeListScopes.mockResolvedValue({
    ok: true,
    value: [
      { scope: { projectId: 1, viewId: 4 }, name: 'Probe' },
      { scope: { projectId: 2, viewId: 5 }, name: 'Second' },
    ],
  })
  fakeListContainers.mockResolvedValue({ ok: true, value: FULL_COLUMNS })
  fakeListProjects.mockResolvedValue({ ok: true, value: [] })
  fakeCreateContainer.mockResolvedValue({ ok: true, value: { id: '9', name: 'New' } })
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

describe('TodoSettingsDialog — which step the descriptor says it is on', () => {
  it('shows the summary for a connection whose boards are all mapped', async () => {
    await open(vikunja())

    // Nothing on the slice says so — `getSetupStep` reads the boards.
    expect(screen.getByTestId('todo-summary-switch')).toBeTruthy()
  })

  it('shows the mapping step while a board is unmapped', async () => {
    await open(unmapped())

    expect(screen.getByTestId('todo-mapping-step')).toBeTruthy()
  })

  it('shows the boards step while no board is picked', async () => {
    await open(vikunja({ config: { ...vikunja().config, boards: [], defaultProjectId: null } }))

    expect(onScopePicker()).toBe(true)
  })
})

describe('TodoSettingsDialog — the wizard’s own writes', () => {
  /** Two boards, neither mapped, both with columns for every status. */
  function twoUnmapped() {
    const base = vikunja()
    const board = { ...base.config.boards[0], containers: FULL_COLUMNS, mapping: null }
    return {
      ...base,
      config: {
        ...base.config,
        boards: [board, { ...board, projectId: 2, viewId: 5, name: 'Second' }],
      },
    }
  }

  it('keeps the mapping step mounted while it writes its own board', async () => {
    // Opened from the summary for one board (flat, so the table starts from a
    // fresh suggestion and the create-columns panel is on offer).
    const base = vikunja()
    await open({
      ...base,
      config: {
        ...base.config,
        boards: [{ ...base.config.boards[0], kanbanMapping: false }],
      },
    })

    await click(screen.getAllByRole('button', { name: 'integrations.vikunja.summary.columns' })[0])
    expect(screen.getByTestId('todo-mapping-step')).toBeTruthy()

    await click(
      screen.getByRole('button', {
        name: 'integrations.vikunja.mapping.createButton {"n":2}',
      }),
    )

    // The write it just made is its own business: the step is mid-task, and
    // a dialog that recomputed here would throw the user back to the summary.
    expect(fakeCreateContainer).toHaveBeenCalled()
    expect(screen.getByTestId('todo-mapping-step')).toBeTruthy()
  })

  it('lands on the summary when the queue is finished, without a detour', async () => {
    await open(twoUnmapped())
    expect(screen.getByTestId('todo-mapping-step')).toBeTruthy()

    const save = () => screen.getByRole('button', { name: 'integrations.mapping.save' })
    await click(save())
    // Still on the wizard, now on the second board.
    expect(screen.getByTestId('todo-mapping-step')).toBeTruthy()
    await click(save())

    expect(screen.getByTestId('todo-summary-switch')).toBeTruthy()
    // Straight there: the boards step was never rendered, so the account was
    // never asked for its projects.
    expect(screen.queryByTestId('todo-boards-step')).toBeNull()
    expect(fakeListScopes).not.toHaveBeenCalled()
  })

  it('lands on the wizard for a board the boards step just added', async () => {
    await open(vikunja())

    await click(screen.getByRole('button', { name: 'integrations.vikunja.summary.editBoards' }))
    await click(await screen.findByRole('checkbox', { name: 'Second' }))
    await click(screen.getByRole('button', { name: 'integrations.vikunja.boards.continue' }))

    // `onDone` retired the override, and the computed step answers with the
    // board that now has no mapping.
    expect(screen.getByTestId('todo-mapping-step')).toBeTruthy()
    expect(
      screen.getByText(
        'integrations.vikunja.mapping.boardHeader {"n":1,"total":1,"name":"Second"}',
      ),
    ).toBeTruthy()
  })
})

describe('TodoSettingsDialog — leaving the boards step', () => {
  it('returns to the summary when the boards step was opened from it', async () => {
    await open(vikunja())
    // The summary is the computed step for a fully configured integration.
    expect(screen.getByTestId('todo-summary-switch')).toBeTruthy()

    // Vikunja's own summary section is where the boards are changed from.
    await click(screen.getByRole('button', { name: 'integrations.vikunja.summary.editBoards' }))
    expect(onScopePicker()).toBe(true)

    await click(back())

    // Back is cancel here: the connection survives and the user is where
    // they started.
    expect(useTodoStore.getState().integration).not.toBeNull()
    expect(screen.getByTestId('todo-summary-switch')).toBeTruthy()
  })

  it('goes to the boards step from the mapping step’s own Back', async () => {
    await open(vikunja())

    await click(screen.getAllByRole('button', { name: 'integrations.vikunja.summary.columns' })[0])
    expect(screen.getByTestId('todo-mapping-step')).toBeTruthy()

    await click(back())

    // Back is the user's own choice of where to go: the step behind the
    // mapping table is the list of boards, mapped or not.
    expect(onScopePicker()).toBe(true)
  })

  it('disconnects when the boards step is the freshly connected integration’s first step', async () => {
    // No scope yet — the state right after the connect form.
    await open(vikunja({ config: { ...vikunja().config, boards: [], defaultProjectId: null } }))
    expect(onScopePicker()).toBe(true)

    await click(back())

    // There is no earlier step inside this integration, and one without a
    // scope syncs nothing: back means out.
    expect(useTodoStore.getState().integration).toBeNull()
    expect(screen.getByTestId('todo-integration-pick-vikunja')).toBeTruthy()
  })
})
