// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VikunjaSummaryExtras } from '@/widgets/Todo/integrations/vikunja/VikunjaSummaryExtras.tsx'

import type { StatusListMapping } from '@/widgets/Todo/integrations/types.ts'
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

const PREFIX = 'integrations.vikunja.summary'

const MAPPING: StatusListMapping = {
  input: ['1'],
  inprogress: ['1'],
  struggle: ['1'],
  completed: ['3'],
  deleted: ['1'],
}

function board(overrides: Partial<VikunjaBoard> = {}): VikunjaBoard {
  return {
    projectId: 8,
    viewId: 80,
    name: 'Work',
    containers: [],
    mapping: MAPPING,
    kanbanMapping: true,
    ...overrides,
  }
}

let onEditMapping: Mock<(target?: string) => void>
let onPickScope: Mock<() => void>
let updateIntegrationConfig: Mock<(config: unknown) => boolean>

function mount(boards: VikunjaBoard[], defaultProjectId: number | null = 8) {
  const integration: IntegrationState = {
    name: 'vikunja',
    config: {
      baseUrl: 'https://vikunja.example',
      token: 'tk_super-secret-value',
      boards,
      defaultProjectId,
    },
    boardName: null,
    lists: [],
    projects: [],
    mapping: null,
    lastSyncAt: null,
  }

  render(
    <VikunjaSummaryExtras
      integration={integration}
      onEditMapping={onEditMapping}
      onPickScope={onPickScope}
      actions={{ updateIntegrationConfig }}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  onEditMapping = vi.fn<(target?: string) => void>()
  onPickScope = vi.fn<() => void>()
  updateIntegrationConfig = vi.fn<(config: unknown) => boolean>(() => true)
})

afterEach(() => {
  cleanup()
})

describe('VikunjaSummaryExtras — the boards', () => {
  it('names every board, its mode, and which one new tasks go to', () => {
    mount([board(), board({ projectId: 9, name: 'Home', kanbanMapping: false })])

    expect(screen.getByText(`${PREFIX}.boards`)).toBeTruthy()
    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByText('Home')).toBeTruthy()
    // One badge per mode, and the star on the default board only.
    expect(screen.getByText(`${PREFIX}.modeKanban`)).toBeTruthy()
    expect(screen.getByText(`${PREFIX}.modeFlat`)).toBeTruthy()
    expect(screen.getAllByLabelText(`${PREFIX}.defaultBadge`)).toHaveLength(1)
  })

  it('opens the wizard for the board whose columns were asked for', async () => {
    mount([board(), board({ projectId: 9, name: 'Home' })])

    const columns = screen.getAllByRole('button', { name: `${PREFIX}.columns` })
    expect(columns).toHaveLength(2)

    await userEvent.click(columns[0])
    expect(onEditMapping).toHaveBeenCalledWith('8')

    await userEvent.click(columns[1])
    expect(onEditMapping).toHaveBeenLastCalledWith('9')
  })

  it('sends "Change boards" back to the scope step', async () => {
    mount([board()])

    await userEvent.click(screen.getByRole('button', { name: `${PREFIX}.editBoards` }))

    expect(onPickScope).toHaveBeenCalledTimes(1)
  })

  it('falls back to a dash for a board whose name was never read', () => {
    mount([board({ name: '' })])

    expect(screen.getByTestId('todo-summary-board').textContent).toContain('—')
  })
})

describe('VikunjaSummaryExtras — flat mode', () => {
  it('explains what stays local as soon as one board is flat', () => {
    mount([board(), board({ projectId: 9, name: 'Home', kanbanMapping: false })])

    expect(screen.getByTestId('todo-summary-flat-mode')).toBeTruthy()
    expect(screen.getByText('integrations.vikunja.mapping.flatNotice')).toBeTruthy()
    expect(screen.getByText(`${PREFIX}.localOnlyLabel`)).toBeTruthy()
  })

  it('says nothing about it while every board maps its buckets', () => {
    mount([board(), board({ projectId: 9, name: 'Home' })])

    expect(screen.queryByTestId('todo-summary-flat-mode')).toBeNull()
  })
})

describe('VikunjaSummaryExtras — background pull', () => {
  it('still offers the period the worker pulls on', () => {
    mount([board()])

    // Per connection, not per board: it is how often the worker talks to the
    // instance, so the list of boards above does not multiply it.
    expect(screen.getAllByText(`${PREFIX}.pullPeriodLabel`)).toHaveLength(1)
  })
})
