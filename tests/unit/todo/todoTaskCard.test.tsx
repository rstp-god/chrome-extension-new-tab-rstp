// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TodoTaskCard } from '@/widgets/Todo/components/widget/TodoTaskCard.tsx'
import { testIds } from '@tests/constants/testIds.ts'

import type { TodoTask } from '@/widgets/Todo/store/store.ts'

/**
 * Keys, not prose — the same convention as the other component tests here;
 * `tests/contracts/i18nKeys.test.ts` guards the copy itself.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function task(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: 'vikunja:4',
    title: 'Probe',
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

function renderCard(local: TodoTask, hasConflict = false) {
  return render(
    <TodoTaskCard
      task={local}
      project={null}
      hasConflict={hasConflict}
      onToggleTask={vi.fn()}
      onStartTaskExit={vi.fn()}
      onOpenLinkedTab={vi.fn()}
      onChangeStatus={vi.fn()}
    />,
  )
}

afterEach(() => {
  cleanup()
})

describe('TodoTaskCard conflict badge', () => {
  it('is absent by default', () => {
    renderCard(task({ syncState: 'error' }))

    expect(screen.queryByTestId(testIds.todoConflict('vikunja:4'))).toBeNull()
  })

  it('appears with an explanation when the task is in conflict', () => {
    renderCard(task({ syncState: 'error' }), true)

    const badge = screen.getByTestId(testIds.todoConflict('vikunja:4'))
    expect(badge).toHaveAttribute('title', 'task.conflictBadge')
    // Readable by a screen reader too: the icon alone says nothing.
    expect(badge).toHaveAttribute('aria-label', 'task.conflictBadge')
  })

  it('adds nothing at all to a card that is not in conflict', () => {
    // The 20 committed Todo snapshots are of cards without conflicts, so a
    // card without one has to render exactly the markup it rendered before
    // this feature existed — including the dot's `right-3`.
    const { container } = renderCard(task({ syncState: 'dirty' }))

    expect(container.innerHTML).not.toContain('todo-conflict')
    expect(container.innerHTML).not.toContain('right-7')
  })

  it('moves the dirty dot aside instead of stacking it under the badge', () => {
    const { container: alone } = renderCard(task({ syncState: 'dirty' }))
    expect(alone.querySelector('.right-3')).not.toBeNull()

    cleanup()
    const { container: beside } = renderCard(task({ syncState: 'dirty' }), true)
    expect(beside.querySelector('.right-7')).not.toBeNull()
  })
})
