// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Project, ProjectPolicy } from '@/widgets/Todo/integrations/index.ts'
import type { ComponentProps } from 'react'
import type { Mock } from 'vitest'

/**
 * What the add form does with a backend that insists every task names a
 * project (Vikunja: a task lives on a board) versus one where it is optional
 * (Trello).
 *
 * The dialog stays prop-driven — it never sees a config — so the policy and
 * the default id arrive as props and this file is about what it does with
 * them.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { t: (key: string) => key, changeLanguage: async () => {} },
  }),
}))

vi.mock('@/services/chrome/tabs.ts', () => ({
  listLinkableTabs: vi.fn(async () => []),
}))

import { AddTodoDialog } from '@/widgets/Todo/components/widget/AddTodoDialog.tsx'

/**
 * jsdom implements none of the Pointer Capture API, which Radix's select
 * calls on every pointer down. Three no-ops are enough to let the listbox
 * open; scrolling into view is stubbed for the same reason.
 */
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    scrollIntoView: () => {},
  })
})

const PROJECTS: Project[] = [
  { id: '1', name: 'Inbox', pillClassName: null },
  { id: '8', name: 'Work', pillClassName: null },
]

const REQUIRED: ProjectPolicy = {
  required: true,
  defaultId: () => '1',
  changeable: false,
}

const OPTIONAL: ProjectPolicy = {
  required: false,
  defaultId: () => null,
  changeable: true,
}

type SubmitInput = Parameters<ComponentProps<typeof AddTodoDialog>['onSubmit']>[0]

let onSubmit: Mock<(input: SubmitInput) => void>

async function open(policy: ProjectPolicy, defaultProjectId: string | null) {
  onSubmit = vi.fn<(input: SubmitInput) => void>()
  await act(async () => {
    render(
      <AddTodoDialog
        open
        onOpenChange={vi.fn()}
        projects={PROJECTS}
        projectPolicy={policy}
        defaultProjectId={defaultProjectId}
        onSubmit={onSubmit}
      />,
    )
  })
}

/** Fills the title and submits — the shortest path to what was selected. */
async function submit(title = 'Buy milk') {
  await act(async () => {
    await userEvent.type(screen.getByTestId('todo-title-input'), title)
  })
  await act(async () => {
    await userEvent.click(screen.getByTestId('todo-submit'))
  })
}

/** Opens the project select and lists what it offers. */
async function projectOptions(): Promise<string[]> {
  await act(async () => {
    await userEvent.click(screen.getByLabelText('form.projectLabel'))
  })
  return screen.getAllByRole('option').map((option) => option.textContent ?? '')
}

beforeEach(() => {
  onSubmit = vi.fn<(input: SubmitInput) => void>()
})

afterEach(() => {
  cleanup()
})

describe('AddTodoDialog — a backend that requires a project', () => {
  it('offers no "no project" option', async () => {
    await open(REQUIRED, '1')

    // Offering it would promise something the sync cannot do.
    expect(await projectOptions()).toStrictEqual(['Inbox', 'Work'])
  })

  it('submits the default project when the user touches nothing', async () => {
    await open(REQUIRED, '1')

    await submit()

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: '1' }))
  })

  it('submits the project the user picked instead', async () => {
    await open(REQUIRED, '1')

    await act(async () => {
      await userEvent.click(screen.getByLabelText('form.projectLabel'))
    })
    await act(async () => {
      await userEvent.click(screen.getByRole('option', { name: 'Work' }))
    })
    await submit()

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: '8' }))
  })

  it('falls back to no selection when there is no default to preselect', async () => {
    // A connection whose board list has not been read yet: the store's own
    // `addTask` substitutes the default in that case.
    await open(REQUIRED, null)

    await submit()

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }))
  })
})

describe('AddTodoDialog — a backend where a project is optional', () => {
  it('keeps the "no project" option', async () => {
    await open(OPTIONAL, null)

    expect(await projectOptions()).toStrictEqual(['form.projectNone', 'Inbox', 'Work'])
  })

  it('submits no project when the user picks none', async () => {
    await open(OPTIONAL, null)

    await submit()

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }))
  })
})
