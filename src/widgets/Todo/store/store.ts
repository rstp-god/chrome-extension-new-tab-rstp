import { removeArea } from '@/services/chrome/storage.ts'
import { focusOrOpenTab, LinkableTab } from '@/services/chrome/tabs.ts'
import { ChromeSyncActions, withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import {
  getIntegrationDescriptor,
  TODO_STATUSES,
  type IntegrationDescriptor,
  type IntegrationErrorKey,
  type IntegrationOutcome,
  type IntegrationPushOp,
  type Project,
  type RemoteContainer,
  type RemoteScope,
  type RemoteTaskRef,
  type StatusListMapping,
  type TodoIntegration,
  type TodoStatus,
} from '@/widgets/Todo/integrations/index.ts'
import { create } from 'zustand/react'

import { integrationSchema, todoEnvelopeSchema } from './schema.ts'
import type { IntegrationState, TodoPersistedState, TodoTask } from './schema.ts'

export const TODO_STORAGE_KEY = 'todo-widget:v1'

export type {
  TodoStatus,
  StatusListMapping,
  Project,
  RemoteTaskRef,
  TrelloRemoteRef,
  VikunjaRemoteRef,
} from '@/widgets/Todo/integrations/index.ts'
export type {
  IntegrationState,
  LinkedTab,
  TodoSyncState,
  TodoTask,
  TrelloConfig,
  VikunjaConfig,
} from './schema.ts'
export { TODO_STATUSES, todoEnvelopeSchema }

/**
 * The remote address of the active integration, or `null` when there is none
 * or the user hasn't picked one yet. The shape of a scope is the descriptor's
 * business — this is the single place the store (and the UI) asks for it.
 */
export function resolveScope(integration: IntegrationState | null): RemoteScope | null {
  if (!integration) return null
  const descriptor = getIntegrationDescriptor(integration.name)
  if (!descriptor) return null
  return descriptor.getScope(integration.config)
}

interface AddTaskInput {
  title: string
  description?: string
  linkedTab?: LinkableTab
  projectId?: string | null
}

interface TodoWidgetState {
  tasks: TodoTask[]
  integration: IntegrationState | null
  loading: boolean
  errorKey: IntegrationErrorKey | null

  addTask: (input: AddTaskInput) => void
  setStatus: (id: string, status: TodoStatus) => void
  setProject: (id: string, projectId: string | null) => void
  toggleTask: (id: string) => void
  removeTask: (id: string) => void
  openOrFocusLinkedTab: (id: string) => Promise<void>

  connectIntegration: (name: string, config: unknown) => Promise<void>
  pickScope: (
    scope: RemoteScope,
    name: string,
    containers: RemoteContainer[],
    projects: Project[],
  ) => void
  setMapping: (mapping: StatusListMapping) => Promise<void>
  clearIntegration: () => void
  syncNow: () => Promise<void>
}

function normalizeTitle(title: string) {
  return title.trim()
}

function normalizeDescription(description?: string) {
  const value = description?.trim()
  return value ? value : null
}

function applyStatusTimestamps(
  task: TodoTask,
  status: TodoStatus,
  now: number,
): Pick<TodoTask, 'status' | 'statusChangedAt' | 'completedAt' | 'deletedAt'> {
  return {
    status,
    statusChangedAt: now,
    completedAt: status === 'completed' ? now : task.completedAt,
    deletedAt: status === 'deleted' ? now : task.deletedAt,
  }
}

function getActiveDescriptor(state: TodoWidgetState): IntegrationDescriptor | null {
  if (!state.integration) return null
  return getIntegrationDescriptor(state.integration.name)
}

function getActiveAdapter(state: TodoWidgetState): TodoIntegration | null {
  const descriptor = getActiveDescriptor(state)
  if (!descriptor || !state.integration) return null
  return descriptor.create(state.integration.config)
}

function inferOpForTask(task: TodoTask): IntegrationPushOp {
  if (!task.remoteRef) return { kind: 'create' }
  return { kind: 'update' }
}

function patchTask(tasks: TodoTask[], id: string, patch: Partial<TodoTask>): TodoTask[] {
  return tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
}

export const useTodoStore = create<TodoWidgetState & ChromeSyncActions>()(
  withChromeSync<TodoWidgetState, TodoPersistedState>({
    key: TODO_STORAGE_KEY,
    // Trello connected → the board itself is the cross-device sync, and the
    // config holds apiKey/token, so we keep everything device-local: secrets
    // never reach `storage.sync`. Local list (no integration) → sync the tasks.
    area: (state) => (state.integration ? 'local' : 'sync'),
    // No debounce: task actions are discrete (add/status/project), never
    // slider-frequency, and dedup skips writes on non-persisted changes
    // (loading/errorKey). Persisting immediately also avoids a pending write
    // landing after an external clear/reload.
    schema: todoEnvelopeSchema,
    partialize: (state) => ({
      tasks: state.tasks,
      integration: state.integration,
    }),
    merge: (_current, incoming) => ({
      tasks: incoming.tasks,
      integration: incoming.integration,
    }),
  })((set, get) => {
    const pushTaskAsync = async (taskId: string, op: IntegrationPushOp): Promise<void> => {
      const state = get()
      const adapter = getActiveAdapter(state)
      const integration = state.integration
      const scope = resolveScope(integration)
      if (!adapter || !integration?.mapping || !scope) {
        // No active integration or mapping — clear the dirty flag, nothing to push.
        set({
          tasks: patchTask(get().tasks, taskId, { syncState: 'clean' }),
        })
        return
      }

      const task = state.tasks.find((t) => t.id === taskId)
      if (!task) return

      const out = await adapter.pushTask(task, op, {
        scope,
        mapping: integration.mapping,
        knownRef: task.remoteRef,
      })

      if (out.ok) {
        set({
          tasks: patchTask(get().tasks, taskId, {
            remoteRef: out.value,
            syncState: 'clean',
          }),
        })
      } else {
        set((current) => ({
          tasks: patchTask(current.tasks, taskId, { syncState: 'error' }),
          errorKey: out.errorKey,
        }))
      }
    }

    return {
      tasks: [],
      integration: null,
      loading: false,
      errorKey: null,

      addTask: ({ title, description, linkedTab, projectId }) => {
        const normalizedTitle = normalizeTitle(title)
        if (!normalizedTitle) return

        const now = Date.now()
        const hasIntegration = Boolean(get().integration?.mapping)

        const nextTask: TodoTask = {
          id: crypto.randomUUID(),
          title: normalizedTitle,
          description: normalizeDescription(description),
          status: 'input',
          projectId: projectId ?? null,
          createdAt: now,
          statusChangedAt: now,
          completedAt: null,
          deletedAt: null,
          linkedTab: linkedTab
            ? {
                url: linkedTab.url,
                title: linkedTab.title ?? null,
              }
            : null,
          remoteRef: null,
          syncState: hasIntegration ? 'dirty' : 'clean',
        }

        set((state) => ({
          tasks: [nextTask, ...state.tasks],
        }))

        if (hasIntegration) {
          void pushTaskAsync(nextTask.id, { kind: 'create' })
        }
      },

      setStatus: (id, status) => {
        const previousTask = get().tasks.find((t) => t.id === id)
        if (!previousTask || previousTask.status === status) return

        const now = Date.now()
        const hasIntegration = Boolean(get().integration?.mapping)

        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  ...applyStatusTimestamps(task, status, now),
                  syncState: hasIntegration ? 'dirty' : 'clean',
                }
              : task,
          ),
        }))

        if (hasIntegration) {
          void pushTaskAsync(id, { kind: 'status', previous: previousTask.status })
        }
      },

      setProject: (id, projectId) => {
        const previousTask = get().tasks.find((t) => t.id === id)
        if (!previousTask || previousTask.projectId === projectId) return

        const hasIntegration = Boolean(get().integration?.mapping)

        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  projectId,
                  syncState: hasIntegration ? 'dirty' : 'clean',
                }
              : task,
          ),
        }))

        if (hasIntegration) {
          void pushTaskAsync(id, { kind: 'project', previous: previousTask.projectId })
        }
      },

      toggleTask: (id) => {
        const task = get().tasks.find((t) => t.id === id)
        if (!task) return

        const next: TodoStatus = task.status === 'completed' ? 'input' : 'completed'
        get().setStatus(id, next)
      },

      removeTask: (id) => {
        get().setStatus(id, 'deleted')
      },

      openOrFocusLinkedTab: async (id) => {
        const linkedTab = get().tasks.find((task) => task.id === id)?.linkedTab
        if (!linkedTab) return

        await focusOrOpenTab(linkedTab)
      },

      connectIntegration: async (name, config) => {
        const descriptor = getIntegrationDescriptor(name)
        if (!descriptor) {
          set({ errorKey: 'unknown' })
          return
        }

        // The config arrives as `unknown` from the integration's own connect
        // form, so validate the whole candidate slice against the very schema
        // that guards storage — before spending a network round-trip on it.
        const parsed = integrationSchema.safeParse({
          name,
          config,
          boardName: null,
          lists: [],
          projects: [],
          mapping: null,
          lastSyncAt: null,
        })
        if (!parsed.success) {
          set({ errorKey: 'unknown' })
          return
        }

        set({ loading: true, errorKey: null })
        const adapter = descriptor.create(parsed.data.config)
        const out = await adapter.connect()
        if (!out.ok) {
          set({ loading: false, errorKey: out.errorKey })
          return
        }

        set({
          integration: parsed.data,
          // Refs the freshly connected backend doesn't own can never be
          // resolved against it — drop them so the first sync re-creates the
          // tasks remotely instead of leaving them permanently unpushable.
          tasks: get().tasks.map((task) =>
            task.remoteRef && !descriptor.ownsRef(task.remoteRef)
              ? { ...task, remoteRef: null, syncState: 'clean' }
              : task,
          ),
          loading: false,
          errorKey: null,
        })

        // Persist the connection to `local` FIRST (integration is set →
        // commit writes local immediately), THEN wipe the previous `sync`
        // copy. Doing it in this order means that if the context unloads
        // mid-way, we never end up with the sync copy already deleted while the
        // local copy (with the Trello config) was never written — which would
        // lose the connection and tasks on the next load.
        await useTodoStore.getState().commit()
        await removeArea('sync', TODO_STORAGE_KEY)
      },

      pickScope: (scope, name, containers, projects) => {
        const integration = get().integration
        if (!integration) return
        const descriptor = getIntegrationDescriptor(integration.name)
        if (!descriptor) {
          set({ errorKey: 'unknown' })
          return
        }

        // Only the descriptor knows where the scope lives inside its config,
        // so the write goes through `withScope` and the result is re-checked
        // against the persisted schema before it reaches the store.
        const parsed = integrationSchema.safeParse({
          ...integration,
          config: descriptor.withScope(integration.config, scope),
          boardName: name,
          lists: containers,
          projects,
          // Picking a new scope invalidates the previous mapping.
          mapping: null,
        })
        if (!parsed.success) {
          set({ errorKey: 'unknown' })
          return
        }

        set({ integration: parsed.data })
      },

      setMapping: async (mapping) => {
        const integration = get().integration
        if (!integration) return
        set({
          integration: { ...integration, mapping },
          errorKey: null,
        })
        await get().syncNow()
      },

      clearIntegration: () => {
        // Drop the integration slice entirely; tasks stay (they're still
        // valid local todos, just no longer linked to a remote).
        set({
          integration: null,
          errorKey: null,
          tasks: get().tasks.map((task) => ({
            ...task,
            remoteRef: null,
            syncState: 'clean',
          })),
        })

        // Back to a local list → tasks belong in `sync` again. Commit now so
        // they propagate immediately instead of waiting for the next edit.
        void useTodoStore.getState().commit()

        // Wipe the device-local copy that still holds the Trello secrets.
        // Otherwise the next load would see a local envelope with an active
        // integration and resurrect the just-disconnected integration (and its
        // apiKey/token) via loadInitialEnv's "local wins" rule.
        void removeArea('local', TODO_STORAGE_KEY)
      },

      syncNow: async () => {
        const state = get()
        const descriptor = getActiveDescriptor(state)
        const adapter = getActiveAdapter(state)
        const integration = state.integration

        if (!adapter || !descriptor || !integration) return
        const scope = descriptor.getScope(integration.config)
        if (!scope || !integration.mapping) {
          set({ errorKey: 'mappingIncomplete' })
          return
        }

        set({ loading: true, errorKey: null })

        // Phase 1: push everything that hasn't reached Trello yet.
        // - `syncState !== 'clean'` covers normal dirty/error retries.
        // - `remoteRef === null` catches tasks that were created before the
        //   integration was set up (they were 'clean' because there was
        //   nowhere to sync them at the time). Without this we'd end up with
        //   local tasks coexisting with the pulled set forever and the user
        //   would see them as duplicates after the first sync.
        for (const task of state.tasks.filter(
          (t) => t.syncState !== 'clean' || t.remoteRef === null,
        )) {
          const out: IntegrationOutcome<RemoteTaskRef> = await adapter.pushTask(
            task,
            inferOpForTask(task),
            {
              scope,
              mapping: integration.mapping,
              knownRef: task.remoteRef,
            },
          )
          if (out.ok) {
            set({
              tasks: patchTask(get().tasks, task.id, {
                remoteRef: out.value,
                syncState: 'clean',
              }),
            })
          } else {
            set({ loading: false, errorKey: out.errorKey })
            return
          }
        }

        // Phase 2: pull authoritative state and reconcile.
        const knownRefs: Record<string, RemoteTaskRef> = {}
        for (const task of get().tasks) {
          if (task.remoteRef) knownRefs[task.id] = task.remoteRef
        }

        const pull = await adapter.pullTasks({
          scope,
          mapping: integration.mapping,
          knownRefs,
        })
        if (!pull.ok) {
          set({ loading: false, errorKey: pull.errorKey })
          return
        }

        const localById = new Map(get().tasks.map((t) => [t.id, t]))
        const reconciled: TodoTask[] = pull.value.tasks.map((remote) => {
          const local = localById.get(remote.id)
          if (!local) return remote
          // Local-only fields win (linkedTab, syncState if dirty).
          return {
            ...remote,
            linkedTab: local.linkedTab,
            syncState: local.syncState === 'clean' ? 'clean' : local.syncState,
          }
        })

        // Keep tasks the pull didn't mention when their ref can't have been
        // part of it: purely-local ones (no ref — they may be in-flight) and
        // ones carrying a ref from another backend. A task with a ref this
        // descriptor *does* own and that the pull left out was deleted
        // remotely, and still drops out.
        const remoteIds = new Set(pull.value.tasks.map((t) => t.id))
        for (const local of get().tasks) {
          if (remoteIds.has(local.id)) continue
          if (!local.remoteRef || !descriptor.ownsRef(local.remoteRef)) {
            reconciled.push(local)
          }
        }

        set({
          tasks: reconciled,
          integration: { ...integration, lastSyncAt: Date.now() },
          loading: false,
        })
      },
    }
  }),
)
