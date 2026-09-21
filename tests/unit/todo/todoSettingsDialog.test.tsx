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
          listContainers: vi.fn(),
          listProjects: vi.fn(),
          pullTasks: vi.fn(async () => ({ ok: true, value: { tasks: [], refs: {} } })),
          pushTask: vi.fn(),
        }),
      }
    },
  }
})

import { TodoSettingsDialog } from '@/widgets/Todo/components/settings/TodoSettingsDialog.tsx'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'

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
  fakeListScopes.mockResolvedValue({
    ok: true,
    value: [{ scope: { projectId: 1, viewId: 4 }, name: 'Probe' }],
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

describe('TodoSettingsDialog — leaving the boards step', () => {
  it('returns to the summary when the boards step was opened from it', async () => {
    await open(vikunja())
    // The summary is the computed step for a fully configured integration.
    expect(screen.getByTestId('todo-summary-switch')).toBeTruthy()

    await click(screen.getByRole('button', { name: 'integrations.vikunja.summary.rePickBoard' }))
    expect(onScopePicker()).toBe(true)

    await click(back())

    // Back is cancel here: the connection survives and the user is where
    // they started.
    expect(useTodoStore.getState().integration).not.toBeNull()
    expect(screen.getByTestId('todo-summary-switch')).toBeTruthy()
  })

  it('returns to the summary after the wizard was opened for one board', async () => {
    // Two mapped boards: the computed step is the summary, and the only way
    // onto the mapping step is the summary's per-board "Columns".
    const base = vikunja()
    await open({
      ...base,
      config: {
        ...base.config,
        boards: [
          base.config.boards[0],
          { ...base.config.boards[0], projectId: 2, viewId: 5, name: 'Second' },
        ],
      },
    })

    await click(screen.getAllByRole('button', { name: 'integrations.vikunja.summary.columns' })[1])

    // The step knows which board it was opened for, even though it is one.
    expect(
      screen.getByText(
        'integrations.vikunja.mapping.boardHeader {"n":1,"total":1,"name":"Second"}',
      ),
    ).toBeTruthy()

    await click(back())

    // Nothing is waiting to be mapped, so "Back" is out of the override and
    // onto the summary — not down to the boards step.
    expect(screen.getByTestId('todo-summary-switch')).toBeTruthy()
    expect(onScopePicker()).toBe(false)
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
