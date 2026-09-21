// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TodoSettingsStepBody } from '@/widgets/Todo/components/settings/TodoSettingsStepBody.tsx'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'

import type { IntegrationState } from '@/widgets/Todo/store/store.ts'

/**
 * Which mapping step the dialog renders for which backend.
 *
 * The interesting part is not the markup but the wiring: a descriptor may
 * bring its own step (`descriptor.MappingStep`), and the generic table is the
 * fallback. Both are imported statically — a descriptor's UI is prop-driven
 * precisely so that can work without an import cycle through the store.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { t: (key: string) => key, changeLanguage: async () => {} },
  }),
}))

// The store persists on every `set`; keep storage inert in jsdom.
vi.mock('@/services/chrome/storage.ts', () => ({
  getArea: vi.fn(async () => null),
  setArea: vi.fn(async () => true),
  removeArea: vi.fn(async () => true),
  getLocal: vi.fn(async () => null),
  setLocal: vi.fn(async () => true),
}))

const VIKUNJA: IntegrationState = {
  name: 'vikunja',
  config: {
    baseUrl: 'https://vikunja.example',
    token: 'tk_super-secret-value',
    boards: [
      {
        projectId: 1,
        viewId: 4,
        name: 'Inbox',
        containers: [
          { id: '1', name: 'To-Do', isDefault: true },
          { id: '3', name: 'Done', isTerminal: true },
        ],
        mapping: null,
        kanbanMapping: true,
      },
    ],
    defaultProjectId: 1,
  },
  boardName: 'Inbox',
  lists: [
    { id: '1', name: 'To-Do', isDefault: true },
    { id: '3', name: 'Done', isTerminal: true },
  ],
  projects: [],
  mapping: null,
  lastSyncAt: null,
}

const TRELLO: IntegrationState = {
  name: 'trello',
  config: { apiKey: 'k', token: 't', boardId: 'board-1' },
  boardName: 'Board',
  lists: [{ id: 'l1', name: 'Inbox' }],
  projects: [],
  mapping: null,
  lastSyncAt: null,
}

function renderMappingStep(integration: IntegrationState) {
  useTodoStore.setState({ tasks: [], integration, loading: false, errorKey: null })
  render(
    <TodoSettingsStepBody
      step="mapping"
      pickedIntegrationName={null}
      onPickIntegration={vi.fn()}
      onCancelConnect={vi.fn()}
      onLeaveScopePicker={vi.fn()}
      onLeaveMapping={vi.fn()}
      onEditMapping={vi.fn()}
      onPickScope={vi.fn()}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  useTodoStore.setState({ tasks: [], integration: null, loading: false, errorKey: null })
})

describe('TodoSettingsStepBody — the mapping step', () => {
  it('renders the descriptor’s own step for Vikunja', () => {
    renderMappingStep(VIKUNJA)

    // Copy only the Vikunja step has.
    expect(screen.getByText('integrations.vikunja.mapping.suggestedHint')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'integrations.mapping.save' })).toBeTruthy()
  })

  it('renders the generic table for a backend without one', () => {
    renderMappingStep(TRELLO)

    expect(screen.queryByText('integrations.vikunja.mapping.suggestedHint')).toBeNull()
    expect(screen.getByRole('button', { name: 'integrations.mapping.save' })).toBeTruthy()
    // The generic table's own empty-row hint, not Vikunja's bucket wording.
    expect(screen.getAllByText('integrations.mapping.emptyHint').length).toBeGreaterThan(0)
  })

  it('renders nothing while there is no integration to map', () => {
    useTodoStore.setState({ tasks: [], integration: null, loading: false, errorKey: null })
    const { container } = render(
      <TodoSettingsStepBody
        step="mapping"
        pickedIntegrationName={null}
        onPickIntegration={vi.fn()}
        onCancelConnect={vi.fn()}
        onLeaveScopePicker={vi.fn()}
        onLeaveMapping={vi.fn()}
        onEditMapping={vi.fn()}
        onPickScope={vi.fn()}
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
