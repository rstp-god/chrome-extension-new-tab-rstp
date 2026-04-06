import { beforeEach, describe, expect, it, vi } from 'vitest'

const focusOrOpenTabMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/services/chrome/tabs.ts', () => ({
  focusOrOpenTab: focusOrOpenTabMock,
}))

import { useTodoStore } from '@/widgets/Todo/store/store.ts'

beforeEach(() => {
  focusOrOpenTabMock.mockReset()
  useTodoStore.setState({ tasks: [] })
})

describe('todo store', () => {
  it('adds normalized task', () => {
    useTodoStore.getState().addTask({ title: '  Hello  ', description: '  world  ' })
    const task = useTodoStore.getState().tasks[0]

    expect(task.title).toBe('Hello')
    expect(task.description).toBe('world')
    expect(task.completed).toBe(false)
    expect(task.deleted).toBe(false)
  })

  it('marks task as completed and resets deleted flags', () => {
    useTodoStore.setState({
      tasks: [
        {
          id: '1',
          title: 'Task',
          description: null,
          completed: false,
          deleted: true,
          createdAt: 1,
          completedAt: null,
          deletedAt: 2,
          linkedTab: null,
        },
      ],
    })

    useTodoStore.getState().toggleTask('1')
    const task = useTodoStore.getState().tasks[0]

    expect(task.completed).toBe(true)
    expect(task.completedAt).not.toBeNull()
    expect(task.deleted).toBe(false)
    expect(task.deletedAt).toBeNull()
  })

  it('marks task as deleted', () => {
    useTodoStore.setState({
      tasks: [
        {
          id: '1',
          title: 'Task',
          description: null,
          completed: false,
          deleted: false,
          createdAt: 1,
          completedAt: null,
          deletedAt: null,
          linkedTab: null,
        },
      ],
    })

    useTodoStore.getState().removeTask('1')
    const task = useTodoStore.getState().tasks[0]

    expect(task.deleted).toBe(true)
    expect(task.deletedAt).not.toBeNull()
  })
})
