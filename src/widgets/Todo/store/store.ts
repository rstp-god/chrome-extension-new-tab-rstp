import { removeArea } from '@/services/chrome/storage.ts'
import { focusOrOpenTab, LinkableTab } from '@/services/chrome/tabs.ts'
import { ChromeSyncActions, withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import {
  getIntegrationDescriptor,
  getProjectPolicy,
  isReadyToSync,
  TODO_STATUSES,
  type BoardStatePatch,
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

import { expireHandoverSnapshot, saveHandoverSnapshot } from './handover.ts'
import { TODO_HANDOVER_KEY, TODO_STORAGE_KEY } from './keys.ts'
import { integrationSchema, todoEnvelopeSchema, todoHandoverSchema } from './schema.ts'
import { pushPhase, reconcile, selectPendingTasks } from './sync.ts'

import type { IntegrationState, TodoPersistedState, TodoTask } from './schema.ts'

export { TODO_HANDOVER_KEY, TODO_STORAGE_KEY }

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
  TodoHandoverSnapshot,
  TodoSyncState,
  TodoTask,
  TrelloConfig,
  VikunjaBoard,
  VikunjaConfig,
} from './schema.ts'
export { TODO_STATUSES, todoEnvelopeSchema, todoHandoverSchema }

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

/**
 * Is there enough configured for a sync to mean anything? The companion of
 * `resolveScope`, and for the same reason: the answer is the descriptor's
 * (`isReadyToSync`), and this is the one place the widget's components ask
 * for it.
 *
 * Every "the integration is set up" test in the UI goes through here — the
 * mount sync, the remote-change subscription, the back-online flush, the
 * footer's sync button and its badge — so none of them has to know that a
 * mapping used to live on the slice.
 */
export function isIntegrationReady(integration: IntegrationState | null): boolean {
  if (!integration) return false
  return isReadyToSync(getIntegrationDescriptor(integration.name), integration)
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
  /**
   * Stores the scope the user picked, plus what the picker read about it.
   *
   * Async because a backend whose projects *are* its scopes has to be asked
   * again once the pick has landed — see the body.
   */
  pickScope: (
    scope: RemoteScope,
    scopeName: string,
    containers: RemoteContainer[],
    projects: Project[],
  ) => Promise<void>
  setMapping: (mapping: StatusListMapping) => Promise<void>
  updateIntegrationConfig: (config: unknown) => boolean
  refreshContainers: () => Promise<boolean>
  clearIntegration: () => Promise<void>
  /**
   * Leaves a handover snapshot behind, then drops the integration.
   *
   * Serves both summary actions — "Disconnect" and "Switch integration" —
   * because they do the same thing to the store: the tasks stay, unlinked,
   * a copy of them is kept in case the next connection goes wrong, and the
   * settings dialog lands back on the picker. What differs is the
   * confirmation each one shows, which is the summary's business.
   */
  switchIntegration: () => Promise<void>
  /**
   * Sends the named local tasks to the backend on purpose, for an
   * integration that does not take them automatically
   * (`autoImportLocalTasks !== true`).
   *
   * Marking them `dirty` is the whole mechanism: the next sync's push phase
   * picks up anything non-clean, and a task with no ref is pushed as a
   * `create`. Ids that name a task which is already linked are ignored —
   * "import" means "create remotely", and a linked task has been.
   */
  importLocalTasks: (ids: string[]) => Promise<void>
  syncNow: (options?: SyncNowOptions) => Promise<void>
  /**
   * Retires the current error without syncing.
   *
   * For the banners the user can act on: once the host permission is granted
   * again, the `permissionMissing` that raised the banner describes the past,
   * and the sync that follows is what decides the next state.
   */
  clearError: () => void
  /**
   * Records a failure the widget did not ask for: the backend's own watcher
   * (Vikunja's background pull) hit a wall while nobody was looking.
   *
   * Sets `errorKey` and nothing else — in particular not `loading`, because
   * there is no operation in flight to spin for.
   */
  reportRemoteFailure: (errorKey: IntegrationErrorKey) => void
}

/**
 * How a sync differs from the one the user asks for.
 *
 * `silent` keeps `loading` alone: a refresh the widget started by itself —
 * because the worker said the remote moved — must not put the spinner on the
 * Sync now button or flicker the badge, and must not clear a `loading` that a
 * manual sync running at the same time owns.
 *
 * `force` defaults to `!silent`, which is the honest coupling rather than a
 * shortcut: a sync the user (or a mounting widget) started is worth a real
 * read, while one triggered by a broadcast is a reaction to a read that has
 * just happened and is served from the worker's snapshot. It stays separately
 * settable because the two are not the same question.
 *
 * `silent` is about the spinner only: a silent run still clears a previous
 * `errorKey` when it starts and still sets one when it fails. A background
 * refresh that succeeded is exactly what should retire a stale banner, and
 * one that failed is how the user finds out the sync has stopped working.
 */
export interface SyncNowOptions {
  silent?: boolean
  force?: boolean
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

/**
 * The slice fields a single-scope backend keeps its cached scope state in.
 *
 * Only the fields a caller actually knows about are passed: picking a scope
 * knows all three, saving a mapping knows the mapping, refreshing the columns
 * knows the columns — and an absent one must keep whatever the slice holds.
 */
interface SliceMirror {
  boardName?: string | null
  lists?: RemoteContainer[]
  mapping?: StatusListMapping | null
}

/**
 * What a descriptor with `withBoardState` gets on the slice: nothing.
 *
 * `boardName` / `lists` / `mapping` are the single-scope fields, and for a
 * backend that keeps them per board they are dead — every reader in the
 * widget now goes through the descriptor (`getSetupStep`, `isReadyToSync`) or
 * through the board itself. They are written as empty rather than left alone
 * so a record cannot carry a stale mirror of a board that has since changed,
 * which is exactly the copy a future reader would trust by mistake.
 */
const DEAD_MIRROR = { boardName: null, lists: [], mapping: null } as const

/**
 * A candidate integration slice with what the store has just learned about
 * the scope written where this backend keeps it.
 *
 * Two answers, one per kind of backend. A descriptor with `withBoardState`
 * keeps it inside the config, per board — `config.boards` for Vikunja — and
 * its slice mirror is emptied (see `DEAD_MIRROR`). One without the hook has
 * nowhere else to keep it: the mirror *is* its storage, so `mirror` lands on
 * the slice and the config comes back exactly as it was (Trello).
 *
 * Returned as a candidate rather than set, because every caller re-validates
 * it against the schema that guards storage before it reaches the store.
 */
function withBoardState(
  integration: IntegrationState,
  config: unknown,
  patch: BoardStatePatch,
  mirror: SliceMirror,
): Record<string, unknown> {
  const descriptor = getIntegrationDescriptor(integration.name)
  if (!descriptor?.withBoardState) return { ...integration, config, ...mirror }
  return { ...integration, config: descriptor.withBoardState(config, patch), ...DEAD_MIRROR }
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
    // This store's schema upgrades what it parses (`upgrade.ts`: the
    // single-board Vikunja config becomes `boards[]`), and the service worker
    // reads the very same record for its background pull — so the upgraded
    // shape has to reach storage without waiting for the user's next edit.
    persistTransformedEnvelope: true,
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
    /**
     * The sync that is currently running, if any — the store's single-flight
     * slot.
     *
     * Every entry point can overlap with another: the widget's mount effect,
     * the worker's broadcast, `setMapping`, `importLocalTasks`, the footer's
     * button and the back-online flush. Two overlapping runs would both read
     * the same pending list in phase 1 and push every task in it twice —
     * which, for a task with no ref yet, means the backend gets two records
     * and the widget keeps a ref to one of them. So a run never overlaps a
     * run.
     *
     * But an overlapping caller must not simply *join* the one in flight
     * either: phase 1 snapshotted the task list before that caller changed
     * it, so joining would resolve without having pushed the thing the
     * caller had just made pending — `importLocalTasks` would mark tasks
     * dirty, wait, and create nothing. Hence the queue below, which is the
     * same shape as the worker's `ensureAlarm`: a request that arrives mid-run
     * sets it, and the tail of the running sync spends it on exactly one more
     * run. Any number of callers arriving during one run coalesce into that
     * single follow-up, and every one of them is handed the drainer's
     * promise — so awaiting `syncNow()` always means "my state has been
     * synced", never "somebody else's was".
     */
    let inFlightSync: Promise<void> | null = null
    let queuedSync: SyncNowOptions | null = null

    /**
     * Options for the follow-up run, folded together from every caller that
     * queued it.
     *
     * `force` wins: a caller that wants a real read of the backend must not
     * be answered from the worker's snapshot because someone else was happy
     * with it. `silent` loses: one manual sync among the queued callers means
     * the follow-up owns the spinner, because somebody is watching it.
     */
    const foldSyncOptions = (
      queued: SyncNowOptions | null,
      arriving: SyncNowOptions | undefined,
    ): SyncNowOptions => {
      const silent = arriving?.silent === true
      const force = arriving?.force ?? !silent
      if (!queued) return { silent, force }
      return { silent: queued.silent === true && silent, force: queued.force === true || force }
    }

    /**
     * Writes one settled push into the store.
     *
     * Shared by the optimistic single-task path and by the sync's push phase,
     * because the three outcomes mean the same thing in both and drifting
     * apart is how a task ends up with a `remoteRef` in one flow and without
     * it in the other.
     *
     * The failure branches keep `out.ref` when the adapter reported one: a
     * multi-request push (Vikunja's create → label → place) can fail after the
     * remote record already exists, and a store that forgot the ref would have
     * the next sync create the very same task again.
     *
     * The global `errorKey` is deliberately not touched here — `pushTaskAsync`
     * raises it for a single user action, while a sync raises it once for the
     * whole phase.
     */
    const applyPushOutcome = (task: TodoTask, out: IntegrationOutcome<RemoteTaskRef>): void => {
      if (out.ok) {
        set((current) => ({
          tasks: patchTask(current.tasks, task.id, { remoteRef: out.value, syncState: 'clean' }),
          // A push that landed settles whatever conflict the task was in.
          conflictTaskIds: withoutConflict(current.conflictTaskIds, task.id),
        }))
        return
      }

      const patch: Partial<TodoTask> = {
        remoteRef: out.ref ?? task.remoteRef,
        syncState: 'error',
      }

      if (out.errorKey === 'conflict') {
        // Not a global error: the push was refused because the remote moved
        // on, the local edit is already rolled back on the remote's terms,
        // and the next pull brings the winning version. The task is flagged
        // so the user finds out *which* of their edits was dropped.
        set((current) => ({
          tasks: patchTask(current.tasks, task.id, patch),
          conflictTaskIds: withConflict(current.conflictTaskIds, task.id),
        }))
        return
      }

      set((current) => ({ tasks: patchTask(current.tasks, task.id, patch) }))
    }

    const pushTaskAsync = async (taskId: string, op: IntegrationPushOp): Promise<void> => {
      const state = get()
      const active = getActive(state)
      if (!active || !isReadyToSync(active.descriptor, active.integration)) {
        // Nothing connected, or not finished being connected — clear the
        // dirty flag, there is nothing to push to.
        set({
          tasks: patchTask(get().tasks, taskId, { syncState: 'clean' }),
        })
        return
      }

      const task = state.tasks.find((t) => t.id === taskId)
      if (!task) return

      // Both passed as the store resolved them; a backend that keeps its
      // scopes and mappings per board ignores them (see `PushContext`).
      const out = await active.adapter.pushTask(task, op, {
        scope: active.descriptor.getScope(active.integration.config),
        mapping: active.integration.mapping,
        knownRef: task.remoteRef,
      })

      applyPushOutcome(task, out)
      // One deliberate action of the user's failed; unlike a conflict, that is
      // worth a banner.
      if (!out.ok && out.errorKey !== 'conflict') set({ errorKey: out.errorKey })
    }

    /**
     * One sync, start to finish. Reachable only through `syncNow`, which is
     * what guarantees there is at most one of these running.
     */
    const runSync = async (options?: SyncNowOptions): Promise<void> => {
      const silent = options?.silent === true
      const force = options?.force ?? !silent

      // Phase 1 deliberately iterates this snapshot, not `get()`: tasks
      // added while the sync is in flight belong to the next run.
      const state = get()
      const active = getActive(state)
      if (!active) return
      const { adapter, descriptor, integration } = active

      // The one question about whether a sync can mean anything, and the
      // descriptor's to answer: a backend with several boards is ready when
      // every one of them is mapped, not when a slice field happens to be
      // filled in (see `isReadyToSync`).
      if (!isReadyToSync(descriptor, integration)) {
        set({ errorKey: 'mappingIncomplete' })
        return
      }

      // Passed through to the adapter as they are — `null` included, for a
      // backend that keeps neither on the slice.
      const scope = descriptor.getScope(integration.config)
      const mapping = integration.mapping

      // A silent run clears the previous error but never touches `loading`:
      // the spinner belongs to whoever started a sync on purpose.
      if (silent) set({ errorKey: null })
      else set({ loading: true, errorKey: null })

      // `finally`, not a `set` per exit: the body has half a dozen early
      // returns and an adapter that may throw despite the contract, and a
      // `loading` left `true` freezes the widget's spinner until the next
      // sync — with no way for the user to start one.
      try {
        // Push everything that hasn't reached the remote yet — the rule
        // (including whether tasks predating the integration are swept
        // along) lives in `selectPendingTasks`.
        const pending = selectPendingTasks(state.tasks, descriptor)

        const failure = await pushPhase(pending, {
          adapter,
          descriptor,
          scope,
          mapping,
          onOutcome: applyPushOutcome,
        })
        if (failure !== null) {
          set({ errorKey: failure })
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
          force,
        })
        if (!pull.ok) {
          set({ errorKey: pull.errorKey })
          return
        }

        const merged = reconcile(pull.value.tasks, get().tasks, get().conflictTaskIds, descriptor)

        // Functional update over the *current* slice, not over the snapshot
        // this run started from: `refreshContainers` (the mapping wizard
        // creating columns) can land while the pull is in flight, and
        // spreading the stale `integration` would silently revert its
        // freshly-read containers.
        const lastSyncAt = Date.now()
        set((current) => ({
          tasks: merged.tasks,
          integration: current.integration ? { ...current.integration, lastSyncAt } : null,
          conflictTaskIds: merged.conflictTaskIds,
        }))
      } finally {
        if (!silent) set({ loading: false })
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
        const integration = get().integration
        const descriptor = getIntegrationDescriptor(integration?.name)
        const canPush = isIntegrationReady(integration)

        /**
         * A task the user gave no project lands in the backend's default one
         * when the backend insists on having one: for Vikunja a task lives
         * *in* a project (that is what a board is), so "no project" is not a
         * state it can represent, and creating the task without one would
         * either fail or land it somewhere the widget did not choose.
         *
         * The add dialog preselects the same id, so this is the fallback for
         * the paths that have no dialog behind them (a cached project list
         * that is empty, a programmatic `addTask`).
         */
        const policy = getProjectPolicy(descriptor)
        const resolvedProjectId =
          projectId ??
          (integration && policy.required ? policy.defaultId(integration.config) : null)

        const nextTask: TodoTask = {
          id: crypto.randomUUID(),
          title: normalizedTitle,
          description: normalizeDescription(description),
          status: 'input',
          projectId: resolvedProjectId,
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
          syncState: canPush ? 'dirty' : 'clean',
        }

        set((state) => ({
          tasks: [nextTask, ...state.tasks],
        }))

        if (canPush) {
          void pushTaskAsync(nextTask.id, { kind: 'create' })
        }
      },

      setStatus: (id, status) => {
        const previousTask = get().tasks.find((t) => t.id === id)
        if (!previousTask || previousTask.status === status) return

        const now = Date.now()
        const canPush = isIntegrationReady(get().integration)

        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  ...applyStatusTimestamps(task, status, now),
                  syncState: canPush ? 'dirty' : 'clean',
                }
              : task,
          ),
        }))

        if (canPush) {
          void pushTaskAsync(id, { kind: 'status', previous: previousTask.status })
        }
      },

      setProject: (id, projectId) => {
        const previousTask = get().tasks.find((t) => t.id === id)
        if (!previousTask || previousTask.projectId === projectId) return

        const integration = get().integration
        const descriptor = getIntegrationDescriptor(integration?.name)
        /**
         * Some backends have no such move. A Vikunja task lives *in* a
         * project — changing it would mean recreating the task on another
         * board, with a new id and a new ref — so the policy says the project
         * is not changeable and this does nothing at all rather than writing
         * a local value no sync could ever honour.
         */
        if (!getProjectPolicy(descriptor).changeable) return

        const canPush = isIntegrationReady(integration)

        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  projectId,
                  syncState: canPush ? 'dirty' : 'clean',
                }
              : task,
          ),
        }))

        if (canPush) {
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

      pickScope: async (scope, scopeName, containers, projects) => {
        const integration = get().integration
        if (!integration) return
        const descriptor = getIntegrationDescriptor(integration.name)
        if (!descriptor) {
          set({ errorKey: 'unknown' })
          return
        }

        // Only the descriptor knows where the scope lives inside its config,
        // so the write goes through `withScope` — and what the picker just
        // read about the scope goes through `withBoardState`, which puts it
        // on the board (Vikunja) or on the slice (Trello), never on both. The
        // result is re-checked against the persisted schema before it reaches
        // the store.
        const scoped = withBoardState(
          integration,
          descriptor.withScope(integration.config, scope),
          // Picking a new scope invalidates the previous mapping.
          { name: scopeName, containers, mapping: null },
          { boardName: scopeName, lists: containers, mapping: null },
        )
        const parsed = integrationSchema.safeParse({ ...scoped, projects })
        if (!parsed.success) {
          set({ errorKey: 'unknown' })
          return
        }

        set({ integration: parsed.data, errorKey: null })

        // The picker read the projects through an adapter built from the
        // config *before* this pick, which is the wrong answer for a backend
        // whose projects are its scopes: Vikunja's are its boards, and the
        // board the user has just chosen was not in the config yet — so a
        // fresh connection cached an empty list. Re-read them now that it is.
        //
        // Only for a descriptor that keeps per-scope state (the same ones
        // whose slice mirror is dead): for Trello the picker's answer is
        // already about the board it was read for.
        if (!descriptor.withBoardState) return

        const rescanned = await descriptor.create(parsed.data.config).listProjects(scope)
        // A failure is not worth an error: the projects are a cache for pills
        // and for the add dialog, the mapping step is what comes next, and
        // `refreshContainers` (or the next pick) reads them again.
        if (!rescanned.ok) return

        const current = get().integration
        if (current === null) return

        const reparsed = integrationSchema.safeParse({ ...current, projects: rescanned.value })
        if (reparsed.success) set({ integration: reparsed.data })
      },

      setMapping: async (mapping) => {
        const integration = get().integration
        if (!integration) return

        // The mapping is per board for a backend with several of them, so
        // where it lands is the descriptor's business — and validated, like
        // every other config write.
        const parsed = integrationSchema.safeParse(
          withBoardState(integration, integration.config, { mapping }, { mapping }),
        )
        if (!parsed.success) {
          set({ errorKey: 'unknown' })
          return
        }

        set({ integration: parsed.data, errorKey: null })
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
       * Deliberately leaves `mapping` alone. The callers are Vikunja's
       * mapping step (writing `kanbanMapping: false`, and setting the
       * matching mapping itself) and its pull-period select in the settings
       * summary — neither has any business resetting the mapping, and
       * silently dropping it here would strand the user on the mapping step.
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
          ...withBoardState(
            current,
            current.config,
            { containers: containers.value },
            { lists: containers.value },
          ),
          projects: projects.value,
        })
        if (!parsed.success) {
          set({ loading: false, errorKey: 'unknown' })
          return false
        }

        set({ integration: parsed.data, loading: false, errorKey: null })
        return true
      },

      clearIntegration: async () => {
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
        //
        // Awaited, and strictly before the remove below: when the `sync`
        // write is refused (quota — a long list is exactly the case here)
        // `withChromeSync` falls back to writing a **local** envelope, and a
        // remove racing that fallback would delete the only copy of the list
        // the user has left.
        await useTodoStore.getState().commit()

        // Wipe the device-local copy that still holds the Trello secrets.
        // Otherwise the next load would see a local envelope with an active
        // integration and resurrect the just-disconnected integration (and its
        // apiKey/token) via loadInitialEnv's "local wins" rule.
        await removeArea('local', TODO_STORAGE_KEY)
      },

      switchIntegration: async () => {
        // The copy goes out *before* the state it describes is unlinked: a
        // snapshot taken after `clearIntegration` would record a list with
        // every `remoteRef` already stripped.
        const { integration, tasks } = get()
        await saveHandoverSnapshot(integration, tasks)
        await get().clearIntegration()
      },

      importLocalTasks: async (ids) => {
        const wanted = new Set(ids)
        // Only tasks that never reached the backend. An id naming a linked
        // task is dropped rather than marked dirty: that would push an edit
        // the user never made.
        const targets = new Set(
          get()
            .tasks.filter((task) => wanted.has(task.id) && task.remoteRef === null)
            .map((task) => task.id),
        )
        if (targets.size === 0) return

        set((current) => ({
          tasks: current.tasks.map((task) =>
            targets.has(task.id) ? { ...task, syncState: 'dirty' } : task,
          ),
        }))

        await get().syncNow()
      },

      clearError: () => {
        // Guarded so a banner action on an already-clean store does not
        // notify every subscriber for nothing.
        if (get().errorKey === null) return
        set({ errorKey: null })
      },

      reportRemoteFailure: (errorKey) => {
        // Nothing connected → nothing that could have failed remotely. A
        // broadcast that arrives just after a disconnect must not leave a
        // banner pointing at an integration the user has already dropped.
        if (!get().integration) return
        set({ errorKey })
      },

      syncNow: (options) => {
        // Queue, don't join and don't overlap: see `inFlightSync`.
        if (inFlightSync) {
          queuedSync = foldSyncOptions(queuedSync, options)
          return inFlightSync
        }

        inFlightSync = (async () => {
          await runSync(options)
          // Drains whatever arrived while the run above was in flight. A
          // `while`, not an `if`: a caller that arrives during the follow-up
          // has the same claim to a run as the ones before it, and dropping
          // it would lose exactly the mutation this queue exists for.
          while (queuedSync) {
            const next = queuedSync
            queuedSync = null
            await runSync(next)
          }
        })().finally(() => {
          inFlightSync = null
        })

        return inFlightSync
      },
    }
  }),
)

/**
 * The one moment anything looks at the handover snapshot: the store's own
 * init, once per context.
 *
 * Fire-and-forget on purpose — nothing in the widget waits for it, and the
 * cleanup swallows its own failures. It lives next to the store rather than
 * in an effect because it is about storage the store owns, not about a
 * rendered widget: a New Tab page that never mounts the Todo widget should
 * still stop carrying last month's copy around.
 */
void expireHandoverSnapshot()
