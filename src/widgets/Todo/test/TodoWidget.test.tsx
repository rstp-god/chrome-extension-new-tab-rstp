import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const storeState = vi.hoisted(() => ({
  tasks: [] as Array<{
    id: string
    title: string
    description: string | null
    completed: boolean
    deleted: boolean
    createdAt: number
    completedAt: number | null
    deletedAt: number | null
    linkedTab: { url: string; title?: string | null } | null
  }>,
  addTask: vi.fn(),
  toggleTask: vi.fn(),
  removeTask: vi.fn(),
  openOrFocusLinkedTab: vi.fn(async () => {}),
}))

vi.mock('@/widgets/Todo/store/store.ts', () => ({
  useTodoStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}))

import { TodoWidget } from '@/widgets/Todo/TodoWidget.tsx'

describe('TodoWidget', () => {
  it('renders empty state when there are no tasks', () => {
    storeState.tasks = []
    const html = renderToString(<TodoWidget />)
    expect(html).toContain('empty')
  })

  it('renders task cards when tasks exist', () => {
    storeState.tasks = [
      {
        id: '1',
        title: 'Task 1',
        description: 'Desc 1',
        completed: false,
        deleted: false,
        createdAt: 2,
        completedAt: null,
        deletedAt: null,
        linkedTab: null,
      },
    ]

    const html = renderToString(<TodoWidget />)
    expect(html).toContain('Task 1')
    expect(html).toContain('actions.addTodo')
  })
})
