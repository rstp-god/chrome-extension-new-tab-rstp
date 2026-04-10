import { beforeEach, describe, expect, it, vi } from 'vitest'

const focusOrOpenTabMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/services/chrome/tabs.ts', () => ({
  focusOrOpenTab: focusOrOpenTabMock,
}))

import { useTodoStore, type TodoTask } from '@/widgets/Todo/store/store.ts'

function makeTask(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: '1',
    title: 'Task',
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

beforeEach(() => {
  focusOrOpenTabMock.mockReset()
  useTodoStore.setState({ tasks: [], integration: null, loading: false, errorKey: null })
})

describe('todo store', () => {
  it('adds normalized task in input status', () => {
    useTodoStore.getState().addTask({ title: '  Hello  ', description: '  world  ' })
    const task = useTodoStore.getState().tasks[0]

    expect(task.title).toBe('Hello')
    expect(task.description).toBe('world')
    expect(task.status).toBe('input')
    expect(task.projectId).toBeNull()
    expect(task.syncState).toBe('clean')
  })

  it('toggleTask flips between completed and input', () => {
    useTodoStore.setState({
      tasks: [makeTask({ status: 'input' })],
    })

    useTodoStore.getState().toggleTask('1')
    expect(useTodoStore.getState().tasks[0].status).toBe('completed')
    expect(useTodoStore.getState().tasks[0].completedAt).not.toBeNull()

    useTodoStore.getState().toggleTask('1')
    expect(useTodoStore.getState().tasks[0].status).toBe('input')
  })

  it('removeTask sets status to deleted and stamps deletedAt', () => {
    useTodoStore.setState({
      tasks: [makeTask()],
    })

    useTodoStore.getState().removeTask('1')
    const task = useTodoStore.getState().tasks[0]

    expect(task.status).toBe('deleted')
    expect(task.deletedAt).not.toBeNull()
  })

  it('setStatus moves the task to the requested status', () => {
    useTodoStore.setState({
      tasks: [makeTask()],
    })

    useTodoStore.getState().setStatus('1', 'inprogress')
    expect(useTodoStore.getState().tasks[0].status).toBe('inprogress')

    useTodoStore.getState().setStatus('1', 'struggle')
    expect(useTodoStore.getState().tasks[0].status).toBe('struggle')
  })

  it('setProject updates projectId without touching status', () => {
    useTodoStore.setState({
      tasks: [makeTask({ status: 'inprogress' })],
    })

    useTodoStore.getState().setProject('1', 'label-42')
    const task = useTodoStore.getState().tasks[0]

    expect(task.projectId).toBe('label-42')
    expect(task.status).toBe('inprogress')
  })
})
