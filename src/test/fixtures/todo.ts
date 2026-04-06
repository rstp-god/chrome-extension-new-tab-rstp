import { TodoTask } from '@/widgets/Todo/store/store.ts'

export const todoTaskFixture = (overrides: Partial<TodoTask> = {}): TodoTask => ({
  id: 'task-1',
  title: 'Task title',
  description: 'Task description',
  completed: false,
  deleted: false,
  createdAt: 1,
  completedAt: null,
  deletedAt: null,
  linkedTab: null,
  ...overrides,
})
