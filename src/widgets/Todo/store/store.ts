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
import { mapWithConcurrency } from '@/widgets/Todo/utils/concurrency.ts'
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
  /**
   * Tasks whose last push lost a race: someone changed the remote record
   * after the widget read it, so the local edit was rolled back and the
   * remote version is the one that will survive the next pull.
   *
   * Transient and **not persisted** (absent from `partialize`): it describes
   * the outcome of one sync, and a conflict badge surviving a browser restart
   * — long after the pull that resolved it — would be a lie. A conflict is
   * also not a global error: the other tasks of the same sync are fine, so
   * this list exists instead of `errorKey`, which would blame the whole
   * widget for one task.
   */
  conflictTaskIds: string[]

  addTask: (input: AddTaskInput) => void
  setStatus: (id: string, status: TodoStatus) => void
  setProject: (id: string, projectId: string | null) => void
  toggleTask: (id: string) => void
  removeTask: (id: string) => void
  openOrFocusLinkedTab: (id: string) => Promise<void>

  connectIntegration: (name: string, config: unknown) => Promise<void>
  pickScope: (
    scope: RemoteScope,
    scopeName: string,
    containers: RemoteContainer[],
    projects: Project[],
  ) => void
  setMapping: (mapping: StatusListMapping) => Promise<void>
  updateIntegrationConfig: (config: unknown) => boolean
  refreshContainers: () => Promise<boolean>
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

interface ActiveIntegration {
  integration: IntegrationState
  descriptor: IntegrationDescriptor
  adapter: TodoIntegration
}

/**
 * The active integration resolved once: its persisted slice, the descriptor
 * that owns it and a freshly built adapter. `null` when nothing is connected
 * or the persisted `name` has no descriptor (an integration removed from the
 * build, say). Adapter construction is cheap — a couple of strings.
 */
function getActive(state: TodoWidgetState): ActiveIntegration | null {
  const integration = state.integration
  if (!integration) return null
  const descriptor = getIntegrationDescriptor(integration.name)
  if (!descriptor) return null
  return { integration, descriptor, adapter: descriptor.create(integration.config) }
}

function inferOpForTask(task: TodoTask): IntegrationPushOp {
  if (!task.remoteRef) return { kind: 'create' }
  return { kind: 'update' }
}

function patchTask(tasks: TodoTask[], id: string, patch: Partial<TodoTask>): TodoTask[] {
  return tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
}

/**
 * The two edits of `conflictTaskIds`, both returning the *same* array when
 * nothing changes — subscribers of the list (the card badge) then re-render
 * only when a conflict actually appears or clears.
 */
function withConflict(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id]
}

function withoutConflict(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((known) => known !== id) : ids
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
      const active = getActive(state)
      const mapping = active?.integration.mapping ?? null
      const scope = active ? active.descriptor.getScope(active.integration.config) : null
      if (!active || !mapping || !scope) {
        // No active integration or mapping — clear the dirty flag, nothing to push.
        set({
          tasks: patchTask(get().tasks, taskId, { syncState: 'clean' }),
        })
        return
      }

      const task = state.tasks.find((t) => t.id === taskId)
      if (!task) return

      const out = await active.adapter.pushTask(task, op, {
        scope,
        mapping,
        knownRef: task.remoteRef,
      })

      if (out.ok) {
        set((current) => ({
          tasks: patchTask(current.tasks, taskId, {
            remoteRef: out.value,
            syncState: 'clean',
          }),
          // A push that landed settles whatever conflict the task was in.
          conflictTaskIds: withoutConflict(current.conflictTaskIds, taskId),
        }))
      } else if (out.errorKey === 'conflict') {
        // Not a global error: the push was refused because the remote moved
        // on, the local edit is already rolled back on the remote's terms,
        // and the next pull brings the winning version. The task is flagged
        // so the user finds out *which* of their edits was dropped.
        set((current) => ({
          tasks: patchTask(current.tasks, taskId, { syncState: 'error' }),
          conflictTaskIds: withConflict(current.conflictTaskIds, taskId),
        }))
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
      conflictTaskIds: [],

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
          // The conflicts belonged to the previous connection; the tasks below
          // are about to be re-linked, so a leftover badge would point at a
          // race that no longer exists.
          conflictTaskIds: [],
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

      pickScope: (scope, scopeName, containers, projects) => {
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
          boardName: scopeName,
          lists: containers,
          projects,
          // Picking a new scope invalidates the previous mapping.
          mapping: null,
        })
        if (!parsed.success) {
          set({ errorKey: 'unknown' })
          return
        }

        set({ integration: parsed.data, errorKey: null })
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

      /**
       * Replaces the active integration's config wholesale.
       *
       * The config is `unknown` by contract — only the descriptor knows its
       * shape — so the candidate slice is re-validated against the very
       * schema that guards storage, exactly like `pickScope` does. A config
       * that does not validate is refused rather than persisted.
       *
       * Deliberately leaves `mapping` alone: the one caller (Vikunja's
       * mapping step, writing `kanbanMapping: false`) sets the matching
       * mapping itself, and silently dropping it here would strand the user
       * on the mapping step.
       *
       * Answers whether the write happened, so a caller that is about to
       * save a matching mapping can stop instead of persisting a mapping for
       * a mode the config never entered.
       */
      updateIntegrationConfig: (config) => {
        const integration = get().integration
        if (!integration) return false

        const parsed = integrationSchema.safeParse({ ...integration, config })
        if (!parsed.success) {
          set({ errorKey: 'unknown' })
          return false
        }

        set({ integration: parsed.data, errorKey: null })
        return true
      },

      /**
       * Re-reads the containers and projects of the current scope, keeping
       * the mapping.
       *
       * `pickScope` also refreshes them but wipes the mapping, which is right
       * when the user changes scope and wrong here: this runs right after the
       * wizard created the missing columns, and the draft mapping it is about
       * to save refers to them.
       *
       * Answers whether the cache is now up to date; a caller that is about
       * to save a mapping pointing at freshly created containers needs to
       * know.
       */
      refreshContainers: async () => {
        const active = getActive(get())
        if (!active) return false
        const { adapter, descriptor, integration } = active

        const scope = descriptor.getScope(integration.config)
        if (!scope) return false

        set({ loading: true, errorKey: null })
        const [containers, projects] = await Promise.all([
          adapter.listContainers(scope),
          adapter.listProjects(scope),
        ])
        if (!containers.ok) {
          set({ loading: false, errorKey: containers.errorKey })
          return false
        }
        if (!projects.ok) {
          set({ loading: false, errorKey: projects.errorKey })
          return false
        }

        // The slice may have moved while the two requests were in flight, so
        // the write starts from the current one rather than from `integration`.
        const current = get().integration
        if (!current) {
          set({ loading: false })
          return false
        }

        const parsed = integrationSchema.safeParse({
          ...current,
          lists: containers.value,
          projects: projects.value,
        })
        if (!parsed.success) {
          set({ loading: false, errorKey: 'unknown' })
          return false
        }

        set({ integration: parsed.data, loading: false, errorKey: null })
        return true
      },

      clearIntegration: () => {
        // Drop the integration slice entirely; tasks stay (they're still
        // valid local todos, just no longer linked to a remote).
        set({
          integration: null,
          errorKey: null,
          // Nothing left to be in conflict with.
          conflictTaskIds: [],
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
        // Phase 1 deliberately iterates this snapshot, not `get()`: tasks
        // added while the sync is in flight belong to the next run.
        const state = get()
        const active = getActive(state)
        if (!active) return
        const { adapter, descriptor, integration } = active

        const scope = descriptor.getScope(integration.config)
        const mapping = integration.mapping
        if (!scope || !mapping) {
          set({ errorKey: 'mappingIncomplete' })
          return
        }

        set({ loading: true, errorKey: null })

        // Phase 1: push everything that hasn't reached the remote yet.
        // - `syncState !== 'clean'` covers normal dirty/error retries.
        // - `remoteRef === null` catches tasks that were created before the
        //   integration was set up (they were 'clean' because there was
        //   nowhere to sync them at the time). Without this we'd end up with
        //   local tasks coexisting with the pulled set forever and the user
        //   would see them as duplicates after the first sync.
        const pending = state.tasks.filter((t) => t.syncState !== 'clean' || t.remoteRef === null)

        // The first hard failure ends the phase. With `pushConcurrency` at its
        // default of 1 that is literally the sequential loop this used to be;
        // with a pool it means "start nothing new", since the calls already in
        // flight cannot be recalled.
        let failure: IntegrationErrorKey | null = null

        await mapWithConcurrency(pending, descriptor.pushConcurrency ?? 1, async (task) => {
          if (failure !== null) return

          const out: IntegrationOutcome<RemoteTaskRef> = await adapter.pushTask(
            task,
            inferOpForTask(task),
            { scope, mapping, knownRef: task.remoteRef },
          )

          if (out.ok) {
            set((current) => ({
              tasks: patchTask(current.tasks, task.id, {
                remoteRef: out.value,
                syncState: 'clean',
              }),
              conflictTaskIds: withoutConflict(current.conflictTaskIds, task.id),
            }))
            return
          }

          if (out.errorKey === 'conflict') {
            // A conflict is this one task's business: the rest of the sync
            // carries on, and phase 2 below settles it by letting the remote
            // version win.
            set((current) => ({
              tasks: patchTask(current.tasks, task.id, { syncState: 'error' }),
              conflictTaskIds: withConflict(current.conflictTaskIds, task.id),
            }))
            return
          }

          failure ??= out.errorKey
        })

        if (failure !== null) {
          set({ loading: false, errorKey: failure })
          return
        }

        // Phase 2: pull authoritative state and reconcile.
        const knownRefs: Record<string, RemoteTaskRef> = {}
        // Statuses go along for backends that cannot store every status
        // remotely (Vikunja in flat mode) — see `PullContext.knownStatuses`.
        const knownStatuses: Record<string, TodoStatus> = {}
        for (const task of get().tasks) {
          if (task.remoteRef) knownRefs[task.id] = task.remoteRef
          knownStatuses[task.id] = task.status
        }

        const pull = await adapter.pullTasks({
          scope,
          mapping,
          knownRefs,
          knownStatuses,
        })
        if (!pull.ok) {
          set({ loading: false, errorKey: pull.errorKey })
          return
        }

        // Conflicts the pull can settle: the whole point of a conflict is that
        // the remote version is the surviving one, so a conflicted task the
        // pull mentions is replaced by it wholesale and stops being flagged.
        // One it does *not* mention stays flagged — nothing has resolved it.
        const unresolved = new Set(get().conflictTaskIds)

        const localById = new Map(get().tasks.map((t) => [t.id, t]))
        const reconciled: TodoTask[] = pull.value.tasks.map((remote) => {
          const local = localById.get(remote.id)
          if (!local) return remote
          if (unresolved.has(remote.id)) {
            unresolved.delete(remote.id)
            // Remote wins: its `syncState` (clean, by construction) is kept
            // rather than the local 'error' the refused push left behind.
            return { ...remote, linkedTab: local.linkedTab }
          }
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

        // Functional update over the *current* slice, not over the snapshot
        // this run started from: `refreshContainers` (the mapping wizard
        // creating columns) can land while the pull is in flight, and
        // spreading the stale `integration` would silently revert its
        // freshly-read containers.
        const lastSyncAt = Date.now()
        set((current) => ({
          tasks: reconciled,
          integration: current.integration ? { ...current.integration, lastSyncAt } : null,
          loading: false,
          conflictTaskIds: [...unresolved],
        }))
      },
    }
  }),
)
