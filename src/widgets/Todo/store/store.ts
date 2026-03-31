import { ChromeSyncActions, withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import { focusOrOpenTab, LinkableTab } from '@/services/chrome/tabs.ts'
import { z } from 'zod'
import { create } from 'zustand/react'

export const TODO_STORAGE_KEY = 'todo-widget:v1'

const linkedTabSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable().optional(),
})

const todoTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  completed: z.boolean(),
  deleted: z.boolean(),
  createdAt: z.number(),
  completedAt: z.number().nullable(),
  deletedAt: z.number().nullable(),
  linkedTab: linkedTabSchema.nullable(),
})

const todoPersistedStateSchema = z.object({
  tasks: z.array(todoTaskSchema),
})

const todoEnvelopeSchema = makeEnvelopeSchema(todoPersistedStateSchema)

export type LinkedTab = z.infer<typeof linkedTabSchema>
export type TodoTask = z.infer<typeof todoTaskSchema>

interface AddTaskInput {
  title: string
  description?: string
  linkedTab?: LinkableTab
}

interface TodoWidgetState {
  tasks: TodoTask[]
  addTask: (input: AddTaskInput) => void
  toggleTask: (id: string) => void
  removeTask: (id: string) => void
  openOrFocusLinkedTab: (id: string) => Promise<void>
}

type TodoPersistedState = z.infer<typeof todoPersistedStateSchema>

function normalizeTitle(title: string) {
  return title.trim()
}

function normalizeDescription(description?: string) {
  const value = description?.trim()
  return value ? value : null
}

export const useTodoStore = create<TodoWidgetState & ChromeSyncActions>()(
  withChromeSync<TodoWidgetState, TodoPersistedState>({
    key: TODO_STORAGE_KEY,
    schema: todoEnvelopeSchema,
    partialize: (state) => ({
      tasks: state.tasks,
    }),
    merge: (_current, incoming) => incoming,
  })((set, get) => ({
    tasks: [],
    addTask: ({ title, description, linkedTab }) => {
      const normalizedTitle = normalizeTitle(title)
      if (!normalizedTitle) return

      const nextTask: TodoTask = {
        id: crypto.randomUUID(),
        title: normalizedTitle,
        description: normalizeDescription(description),
        completed: false,
        deleted: false,
        createdAt: Date.now(),
        completedAt: null,
        deletedAt: null,
        linkedTab: linkedTab
          ? {
              url: linkedTab.url,
              title: linkedTab.title ?? null,
            }
          : null,
      }

      set((state) => ({
        tasks: [nextTask, ...state.tasks],
      }))
    },
    toggleTask: (id) => {
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                completed: !task.completed,
                completedAt: !task.completed ? Date.now() : null,
                deleted: false,
                deletedAt: null,
              }
            : task,
        ),
      }))
    },
    removeTask: (id) => {
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                deleted: true,
                deletedAt: Date.now(),
              }
            : task,
        ),
      }))
    },
    openOrFocusLinkedTab: async (id) => {
      const linkedTab = get().tasks.find((task) => task.id === id)?.linkedTab
      if (!linkedTab) return

      await focusOrOpenTab(linkedTab)
    },
  })),
)
