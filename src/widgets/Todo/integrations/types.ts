import type { ComponentType } from 'react'

import type { IntegrationState, TodoTask } from '../store/store.ts'

/**
 * The five possible states a todo can occupy. Maps onto Trello columns
 * (and, in the future, Notion statuses or other backends) via the user-
 * configurable `StatusListMapping`.
 *
 * See `README.md` ("Writing your own Todo integration" / "Своя интеграция
 * для Todo") for the full guide on plugging a new backend in here.
 */
export const TODO_STATUSES = ['input', 'inprogress', 'struggle', 'completed', 'deleted'] as const

export type TodoStatus = (typeof TODO_STATUSES)[number]

/**
 * Multi-list per status. The first element of each array is the **primary**
 * destination — that's where push operations land when a task moves into
 * the status. Pull operations resolve a Trello listId to a status by looking
 * up which array contains it; lists not present in any array fall back to
 * `'input'` (no special "unmapped" handling).
 */
export type StatusListMapping = Record<TodoStatus, string[]>

export interface Project {
  id: string
  name: string
  pillClassName: string | null
}

/**
 * Where a backend's task list lives, as an opaque address. The store never
 * reads inside it — only the owning descriptor does (`getScope` / `withScope`)
 * — so a backend addressed by one id (Trello: `{ boardId }`) and one
 * addressed by a pair (Vikunja: `{ projectId, viewId }`) share the contract.
 */
export type RemoteScope = Record<string, string | number>

/**
 * The cached state of one scope, as the store hands it to `withBoardState`.
 *
 * Every field is optional and only the ones present are written: the three
 * callers know different amounts (picking a scope knows all of it, saving a
 * mapping knows the mapping, refreshing the columns knows the columns), and
 * an absent field must not overwrite what the config already holds.
 */
export interface BoardStatePatch {
  /** Human name of the scope, as `listScopes` reported it. */
  name?: string
  /** Containers of the scope, as `listContainers` reported them. */
  containers?: RemoteContainer[]
  /** The mapping for this scope, or `null` when it has just been invalidated. */
  mapping?: StatusListMapping | null
}

/** One pickable scope plus its human label, as offered by `listScopes`. */
export interface RemoteScopeOption {
  scope: RemoteScope
  name: string
}

/**
 * A column/bucket inside a scope — what `StatusListMapping` maps statuses to.
 *
 * `isTerminal` marks the backend's own "done" container (Vikunja's done
 * bucket), which has semantics the adapter must respect; `isDefault` marks
 * the one the backend drops new items into. Both are set only when true, so a
 * backend without the notion (Trello: any list can mean anything) writes the
 * plain `{ id, name }` it always has.
 */
export interface RemoteContainer {
  id: string
  name: string
  isTerminal?: boolean
  isDefault?: boolean
}

/** Pointer to the remote Trello card for a local task. */
export interface TrelloRemoteRef {
  cardId: string
  shortLink: string | null
  /** Last observed remote list id — lets us detect drift on next pull. */
  listId: string
  /** Last-known `dateLastActivity`, used as a cheap etag. */
  etag: string | null
}

/** Pointer to the remote Vikunja task for a local task. */
export interface VikunjaRemoteRef {
  taskId: number
  /**
   * The board (Vikunja project) the task lives on.
   *
   * Required rather than optional: with several boards connected, a ref that
   * does not name one addresses nothing — neither a pull nor a push could
   * tell which project to look in. The view is deliberately *not* here; it is
   * looked up on the board (`config.boards`), which is the one place it can
   * change without every ref having to be rewritten.
   */
  projectId: number
  /** Human-facing id (`#42`, `PROJ-42`) — cheap to show, cheap to search. */
  identifier: string
  /** Last observed bucket (kanban column); `null` in flat mode. */
  bucketId: number | null
  /** Last-known `updated` timestamp, used as a cheap etag. */
  updated: string
}

/**
 * Pointer to the remote record for a local task.
 *
 * A plain union, not a discriminated one: refs persisted by the Trello-only
 * build carry no discriminator field, and adding one would mean migrating
 * stored data. The two shapes are disjoint by construction (`cardId` vs
 * `taskId`), so the guards below are enough to tell them apart.
 */
export type RemoteTaskRef = TrelloRemoteRef | VikunjaRemoteRef

export function isTrelloRef(ref: RemoteTaskRef): ref is TrelloRemoteRef {
  return 'cardId' in ref
}

export function isVikunjaRef(ref: RemoteTaskRef): ref is VikunjaRemoteRef {
  return 'taskId' in ref
}

export type IntegrationPushOp =
  | { kind: 'create' }
  | { kind: 'update' } // title/description edit
  | { kind: 'status'; previous: TodoStatus }
  | { kind: 'project'; previous: string | null }
  | { kind: 'delete' } // semantically = move to status 'deleted'
  /**
   * "Make the remote match this task again", used when a sync retries a task
   * whose earlier push failed and the store no longer knows *what* changed.
   *
   * It is not `update`: the widget has no title/description editing UI, so a
   * retry that sent those two fields would push the local (plain-text) copy
   * over whatever the user has since written in the backend's own editor — and
   * for Vikunja that also means flattening rich text on a retry nobody asked
   * for. An adapter implements it as the smallest set of writes that restores
   * the fields the widget actually owns: status/container and project.
   *
   * `update` stays in the union for the editing UI that will need it.
   */
  | { kind: 'resync' }

export type IntegrationErrorKey =
  | 'authInvalid'
  | 'network'
  | 'rateLimited'
  | 'notFound'
  | 'mappingIncomplete'
  | 'pushFailed'
  | 'pullFailed'
  | 'conflict'
  | 'permissionMissing'
  | 'unknown'

export type IntegrationOutcome<T> =
  | { ok: true; value: T }
  | {
      ok: false
      errorKey: IntegrationErrorKey
      /**
       * A ref the failed operation nevertheless established, for the push
       * paths that are several writes long.
       *
       * Creating a task in Vikunja takes up to three requests (create, label,
       * place). If the second one fails, the record *exists* — and an outcome
       * that only said "failed" would leave the store with no ref, so the next
       * sync would create the task a second time. Reporting the ref alongside
       * the failure lets the caller remember what was created while still
       * marking the task as not fully pushed.
       *
       * Callers must treat it as "this much is true", never as success.
       */
      ref?: RemoteTaskRef
    }

/**
 * What a backend that can watch itself reports, as little as the widget needs
 * to act:
 *
 * - `changed` — something moved remotely; the store answers with a silent
 *   sync, which is the only thing it could usefully do with any finer
 *   description;
 * - `failed` — the watcher itself hit a wall the user has to know about (a
 *   revoked token, a withdrawn host permission), observed while no UI was
 *   looking.
 */
export type RemoteChangeEvent =
  | { kind: 'changed' }
  | { kind: 'failed'; errorKey: IntegrationErrorKey }

export interface PullContext {
  /**
   * The address the store resolved for this backend (`descriptor.getScope`),
   * or `null` when it resolved none.
   *
   * Nullable — and, for a backend that keeps a *list* of scopes, beside the
   * point. The store cannot name the one scope a sync is about when there are
   * several of them, so it passes what `getScope` answered and the adapter
   * decides: Trello reads it (one board, one address), Vikunja ignores it and
   * reads its own `config.boards`.
   */
  scope: RemoteScope | null
  /**
   * The mapping on the integration slice, or `null` when there is none.
   *
   * Same split as `scope`: it is where a single-scope backend has always kept
   * its mapping, and a backend with one mapping *per* scope (Vikunja) keeps
   * it on the board instead and ignores this.
   */
  mapping: StatusListMapping | null
  /** Existing local refs keyed by local task id, used by `reconcile`. */
  knownRefs: Record<string, RemoteTaskRef>
  /**
   * Current local status of every task, keyed by local task id.
   *
   * For a backend whose containers carry the status (Trello lists, Vikunja
   * buckets) this is redundant and ignored. It exists for the ones that do
   * not: Vikunja in flat mode knows only `done` / not done, so `inprogress`
   * and `struggle` live nowhere but the local store and a pull would
   * otherwise reset every task to `input` on every sync.
   */
  knownStatuses: Record<string, TodoStatus>
  /**
   * The project ids the store already has cached (`integration.projects`),
   * for an adapter that would otherwise have to read them again to tell a
   * task's project from something else.
   *
   * Vikunja needs it: a task carries label *ids*, and the adapter has to know
   * which of them are real projects rather than the reserved `energy:` /
   * `mood:` ones — a question it used to answer by listing every label on the
   * instance, on every sync, including the cheap non-forced ones the
   * background pull triggers. The cache is refreshed on a forced pull and by
   * the scope picker / `refreshContainers`, which is exactly when the answer
   * can have changed. A backend that does not need it (Trello) ignores it.
   */
  knownProjectIds?: readonly string[]
  /**
   * Read the backend for real instead of answering from whatever the adapter
   * (or the service worker behind it) has cached.
   *
   * Set for a pull the user asked for and for the one a freshly mounted
   * widget makes; left off for a background refresh, which is usually a
   * reaction to the backend having *just* been read — Vikunja's worker
   * broadcasts a change and then serves the following sync from the very
   * snapshot the broadcast was about, so one remote read covers every open
   * tab. A backend with no cache of its own (Trello) ignores it.
   */
  force?: boolean
}

export interface PushContext {
  /** As `PullContext.scope`: what `getScope` answered, which may be `null`. */
  scope: RemoteScope | null
  /** As `PullContext.mapping`: the slice's mapping, which may be `null`. */
  mapping: StatusListMapping | null
  knownRef: RemoteTaskRef | null
}

export interface PullResult {
  tasks: TodoTask[]
  refs: Record<string, RemoteTaskRef>
}

/**
 * One-at-a-time adapter. The widget holds at most one active integration;
 * `store.integration.name` discriminates which descriptor to instantiate.
 *
 * The contract is **Todo-aware on purpose** — it speaks `TodoTask` /
 * `TodoStatus` rather than a generic `<TItem>` shape. Trade-off: if we ever
 * want a Notion adapter for, say, the bookmarks widget, that's a different
 * contract. We chose honesty over speculative reusability.
 */
export interface TodoIntegration {
  /**
   * Validates credentials. Called from the connect UI and (cheaply) at
   * the start of every sync batch to surface revoked tokens early.
   */
  connect(): Promise<IntegrationOutcome<{ userHandle: string }>>

  /** In-memory cleanup; no I/O. */
  disconnect(): void

  /** Every scope the credentials can reach, for the scope-picker step. */
  listScopes(): Promise<IntegrationOutcome<RemoteScopeOption[]>>
  listContainers(scope: RemoteScope): Promise<IntegrationOutcome<RemoteContainer[]>>
  listProjects(scope: RemoteScope): Promise<IntegrationOutcome<Project[]>>

  /**
   * Full pull of every visible card in the configured scope. The adapter
   * is responsible for the listId → status reverse lookup (with fallback
   * to `'input'`). Used on widget mount and on manual `syncNow`.
   */
  pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>>

  /**
   * Single-task push. The store calls this after applying the mutation
   * locally (optimistic update). On failure the store keeps the local
   * change and marks the task as `dirty`; the next `syncNow` retries.
   */
  pushTask(
    task: TodoTask,
    op: IntegrationPushOp,
    ctx: PushContext,
  ): Promise<IntegrationOutcome<RemoteTaskRef>>

  /**
   * Creates a container inside a scope, for a mapping step that offers to
   * build the columns the board is missing.
   *
   * Optional: a backend where columns are not the widget's to create (Trello
   * — a list belongs to the board's own workflow) simply omits it, and a
   * mapping step must check for it before offering the button.
   */
  createContainer?(scope: RemoteScope, title: string): Promise<IntegrationOutcome<RemoteContainer>>
}

export interface ConnectFormProps {
  busy: boolean
  errorKey: IntegrationErrorKey | null
  onConnect: (config: unknown) => Promise<void>
}

/**
 * The store actions a settings step is allowed to call. Handed over rather
 * than imported for the same reason as everything else below.
 *
 * One bundle for both steps a descriptor may bring: the settings layer builds
 * it once and hands the same object to the scope step and to the mapping
 * step, which need the same three actions for the same reason — a scope step
 * that offers several boards writes the config and re-reads the columns, and
 * a mapping step writes the mapping and the mode.
 */
export interface SettingsStepActions {
  /** Persists the mapping and kicks off a sync. */
  setMapping: (mapping: StatusListMapping) => Promise<void>
  /** Replaces the integration's config; `false` when it did not validate. */
  updateIntegrationConfig: (config: unknown) => boolean
  /** Re-reads containers and projects, keeping the mapping; `false` on failure. */
  refreshContainers: () => Promise<boolean>
}

/**
 * Props of a backend's own mapping step.
 *
 * Everything the step needs arrives as a prop: a descriptor's UI components
 * are prop-driven and never import the store. The store imports the
 * integration registry to resolve descriptors, so a component reached from a
 * descriptor that imported the store back would close the loop
 * `store → registry → descriptor → component → store` — a live import cycle
 * whose module init order is significant. `ConnectForm` follows the same
 * rule; the settings layer (`TodoSettingsStepBody`) is where the store is
 * read, and it has all of this at hand already.
 */
export interface MappingStepProps {
  onBack: () => void
  /** The active integration slice, for its containers, mapping and config. */
  integration: IntegrationState
  /** Adapter built from that slice by the settings layer. */
  adapter: TodoIntegration
  /** The scope the containers belong to. */
  scope: RemoteScope
  /** Current store-level error, if any. */
  errorKey: IntegrationErrorKey | null
  actions: SettingsStepActions
}

/**
 * Props of a backend's own scope step — the screen that answers "which board
 * is this integration about".
 *
 * A mirror of `MappingStepProps` minus the one thing a scope step cannot be
 * given: the scope itself, which is what it is there to choose. The generic
 * `TodoSettingsScopePicker` is the default when a descriptor brings none, and
 * it takes these very props (it lives in the settings layer, so unlike a
 * descriptor's own component it may also read the store).
 *
 * Prop-driven for the same reason as `MappingStepProps`: a component reached
 * through a descriptor must not import the store, or the import graph closes
 * the loop `store → registry → descriptor → component → store`.
 */
export interface ScopeStepProps {
  onBack: () => void
  /** The active integration slice, for its config and its cached state. */
  integration: IntegrationState
  /** Adapter built from that slice by the settings layer. */
  adapter: TodoIntegration
  /** Current store-level error, if any. */
  errorKey: IntegrationErrorKey | null
  actions: SettingsStepActions
}

/** The store actions a summary extra may call — the same rule as `SettingsStepActions`. */
export interface SummaryExtrasActions {
  /** Replaces the integration's config; `false` when it did not validate. */
  updateIntegrationConfig: (config: unknown) => boolean
}

/**
 * Props of a backend's own section of the settings summary.
 *
 * Prop-driven for the same reason as `MappingStepProps`: a component reached
 * through a descriptor must not import the store, or the import graph closes
 * the loop `store → registry → descriptor → component → store`.
 */
export interface SummaryExtrasProps {
  integration: IntegrationState
  actions: SummaryExtrasActions
}

/**
 * Which screen of the settings dialog an integration is waiting on.
 *
 * The subset of `DialogStep` that follows from persisted state alone — the
 * other two (`picker`, `connect`) are about a connection that does not exist
 * yet, which is the dialog's own business and no descriptor's.
 */
export type SetupStep = 'board' | 'mapping' | 'summary'

/**
 * What a backend expects of a task's project.
 *
 * Trello's answer is the default one — a project (a label) is optional, the
 * user may change it, and there is no "default project" to fall back on.
 * Vikunja's is the opposite on every count: a task lives *in* a project
 * (that is what a board is), so one is always required, it is the board the
 * task was created on, and moving a task between projects is a different
 * operation from anything the widget offers today.
 */
export interface ProjectPolicy {
  /** Must every task name a project? */
  required: boolean
  /**
   * The project a task gets when the user names none, read out of the
   * persisted config — or `null` when the config names none either.
   *
   * Takes the config rather than the whole slice for the same reason as
   * `getScope`: only the descriptor knows where inside it the answer lives.
   */
  defaultId: (config: unknown) => string | null
  /** May a task be moved to another project from the widget? */
  changeable: boolean
}

export interface IntegrationDescriptor {
  /** Stable machine name; the discriminator in persisted state. */
  name: string
  /** i18n key for the integration's display name (used in the picker). */
  titleI18nKey: string
  /** i18n key for the integration's one-line description in the picker. */
  descriptionI18nKey: string
  /** Renders the connect form inside `TodoSettingsDialog`. */
  ConnectForm: ComponentType<ConnectFormProps>
  /**
   * Replaces the generic mapping table with the backend's own step. Optional:
   * when it is absent the shared `TodoSettingsMapping` renders, which is all
   * a backend with plain columns needs. Vikunja ships one because its buckets
   * carry rules the generic table knows nothing about — a done bucket that
   * flips `done` server-side, and a flat fallback for boards that cannot be
   * mapped at all.
   *
   * Like `ConnectForm`, it is prop-driven (see `MappingStepProps`).
   */
  MappingStep?: ComponentType<MappingStepProps>
  /**
   * Replaces the generic scope picker with the backend's own step. Optional:
   * a backend that syncs one scope needs nothing more than the shared
   * `TodoSettingsScopePicker` — one select and a Continue button.
   *
   * Like `ConnectForm`, it is prop-driven (see `ScopeStepProps`).
   */
  ScopeStep?: ComponentType<ScopeStepProps>
  /**
   * Which screen this integration is waiting on, from its persisted state
   * alone.
   *
   * Optional, and absent means the rule the widget has always had: no scope
   * yet → pick one, no mapping yet → map it, otherwise the summary (see
   * `getSetupStep` in `integrations/setup.ts`, which is the one place either
   * answer is read). A backend that keeps a *list* of scopes implements it
   * because the question is no longer about "the" scope: Vikunja is waiting
   * on the mapping step while *any* of its boards is unmapped, and the
   * default one may not be that board.
   */
  getSetupStep?: (integration: IntegrationState) => SetupStep
  /**
   * Is there enough configured for a sync to mean anything?
   *
   * The gate on every sync the store starts, and on everything the widget
   * shows about syncing (the footer's badge and button). Absent means the
   * historical rule — a scope and a mapping on the slice — and a backend that
   * keeps both per board answers from its boards instead.
   *
   * Deliberately a separate hook from `getSetupStep`: "which screen is the
   * user on" and "may a sync run" agree for every backend today, and would
   * still be two different questions for one that could sync a partially
   * configured connection.
   */
  isReadyToSync?: (integration: IntegrationState) => boolean
  /**
   * The backend's own part of the settings summary — whatever the shared
   * summary cannot know about. Vikunja puts its background-pull period and
   * its flat-mode caveat here; a backend with nothing to add omits it and the
   * summary is just the board/last-sync/mapping block.
   *
   * It exists so the shared summary contains no `integration.name === '…'`
   * branch: one such branch is a comment, three are a second registry.
   */
  SummaryExtras?: ComponentType<SummaryExtrasProps>
  /**
   * The instance this config points at, in a form a sentence can name (a
   * host), or `null` when there is nothing useful to say.
   *
   * The permission banner asks for it: "the extension lost permission for
   * tasks.example.com" is actionable and "…for the integration's host" is
   * not, and only the descriptor knows whether its config holds an address at
   * all. Trello's is fixed in the manifest and names nothing the user chose,
   * so it omits this.
   */
  describeHost?(config: unknown): string | null
  /**
   * Is the per-status container mapping worth showing for this config?
   *
   * Absent means yes, which is every backend whose mapping is what the user
   * built in the wizard. Vikunja answers `false` in flat mode: the mapping
   * then points four statuses at the same default bucket — a placeholder the
   * sync never writes to — and a table repeating it four times would describe
   * something that does not happen. Its `SummaryExtras` says what does.
   */
  showsStatusMapping?(config: unknown): boolean
  /**
   * What this backend expects of a task's project — see `ProjectPolicy`.
   *
   * Optional; absent means Trello's answer, which is also the widget's
   * historical one: a project is optional, changeable, and there is no
   * default (`getProjectPolicy` in `integrations/setup.ts`).
   */
  projectPolicy?: ProjectPolicy
  /** Pure factory: takes persisted config, returns a ready adapter. */
  create: (config: unknown) => TodoIntegration
  /**
   * How many of a sync's pushes the store may have in flight at once.
   *
   * Absent or `1` means the sequential push phase the store has always had,
   * which is what a backend gets by default: parallel writes are only safe
   * when the backend (or the adapter's own transport) guarantees that two
   * pushes cannot interleave into the same record. Vikunja raises it because
   * its worker serialises per task id; Trello leaves it unset.
   *
   * Whatever the value, the first failing push still ends the phase — a pool
   * changes how many requests are in the air, not what a failure means.
   */
  pushConcurrency?: number
  /**
   * Watch the backend and call `onEvent` when it moves, returning the
   * unsubscribe.
   *
   * Optional, because "notice a remote change" is not something an adapter
   * can invent: it needs a push channel. Vikunja has one — its service
   * worker pulls on a `chrome.alarms` schedule and broadcasts what changed —
   * so the descriptor implements it and the widget stops being a page that
   * only knows what it last asked for. Trello does not implement it: polling
   * from the page would be the very thing the worker exists to avoid.
   *
   * It is handed the whole integration rather than one scope, because the
   * set of addresses worth listening to is the descriptor's own reading of
   * its config: Vikunja accepts a broadcast about **any** of `config.boards`
   * and filters out the rest — a broadcast about a project this connection
   * does not sync is not this subscriber's business.
   *
   * The implementation must be inert where there is no channel (the showcase
   * build, tests, a stripped `chrome`) and where the config addresses nothing
   * at all.
   */
  subscribeRemoteChanges?(
    integration: IntegrationState,
    onEvent: (event: RemoteChangeEvent) => void,
  ): () => void
  /**
   * Re-request whatever permission the backend lost, and answer whether it
   * was granted.
   *
   * Optional, because only a backend addressed by a host the user typed has
   * anything to re-request: Vikunja's origin is an *optional* host permission
   * (the instance is unknown at build time), so a user who withdraws it from
   * `chrome://extensions` leaves the worker unable to read anything —
   * `permissionMissing` — with nothing in the UI to fix it. Trello's origin is
   * in the manifest and cannot be withdrawn on its own, so it omits this.
   *
   * **Must start synchronously.** Chrome grants an optional origin only from
   * inside a user gesture, so the implementation has to call
   * `chrome.permissions.request` before it awaits anything and return the
   * promise that call produced — and the caller has to invoke this as the
   * first thing in the click handler. Anything else (a `.then` chain, a
   * settled promise) reads to Chrome as "not a gesture" and the prompt never
   * appears.
   *
   * Resolves `false` rather than rejecting: a dismissed prompt, a stripped
   * `chrome` and a pattern Chrome cannot represent all mean the same thing to
   * the caller — nothing was granted.
   */
  recoverPermission?(config: unknown): Promise<boolean>
  /**
   * May a plain sync push local tasks that were created *before* the
   * integration existed (`remoteRef === null`, `syncState === 'clean'`)?
   *
   * Trello says yes — that has been its behaviour since the widget had one
   * backend, and a Trello board is where its users keep those todos anyway.
   * Vikunja says no, and absent means no: someone connecting their own
   * tracker to see *its* tasks in the widget has not asked for the widget's
   * own backlog to be created in it, and an automatic migration into a
   * foreign tracker is not something a sync can take back (ADR §Р10). Such
   * tasks stay local and unlinked — `reconcile` keeps them — until the user
   * imports them from the settings summary on purpose.
   */
  autoImportLocalTasks?: boolean
  /**
   * Reads the scope out of a persisted config, or `null` while the user
   * hasn't picked one. The scope is deliberately *not* a separate persisted
   * field: it lives inside the config the adapter already owns, and only the
   * descriptor knows which keys make it up.
   */
  getScope: (config: unknown) => RemoteScope | null
  /**
   * Writes the cached state of the scope the store just read — its name, its
   * containers, its mapping — into the config, for a backend that keeps that
   * per scope rather than once.
   *
   * Optional, and absent means "this backend keeps it on the integration
   * slice", which is where it has always lived (`boardName` / `lists` /
   * `mapping`) and is all Trello needs: one board, one set of columns, one
   * mapping. Vikunja implements it because it syncs a *list* of boards and
   * each board has its own columns — the same status maps to a different
   * bucket on each, so a single stored mapping would be wrong for all but one
   * of them.
   *
   * Pure, like `withScope`: it returns a copy of the config, and the store
   * re-validates that copy against the persisted schema before it lands.
   * Writing the slice fields stays the store's own business — a descriptor
   * that implements this hook does not stop them being written.
   */
  withBoardState?: (config: unknown, patch: BoardStatePatch) => unknown
  /** Pure counterpart of `getScope`: returns a copy of the config with the scope written in. */
  withScope: (config: unknown, scope: RemoteScope) => unknown
  /**
   * Does this ref belong to this backend? `RemoteTaskRef` is a plain union,
   * so a record hand-edited (or left behind by another integration) can carry
   * a foreign ref — the store uses this to keep such tasks instead of
   * mistaking them for cards deleted on the remote.
   */
  ownsRef: (ref: RemoteTaskRef) => boolean
}
