import type { ComponentType } from 'react'

import type { TodoTask } from '../store/store.ts'

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

/** One pickable scope plus its human label, as offered by `listScopes`. */
export interface RemoteScopeOption {
  scope: RemoteScope
  name: string
}

/**
 * A column/bucket inside a scope — what `StatusListMapping` maps statuses to.
 * `isTerminal` marks the backend's own "done" container (Vikunja's done
 * bucket), which has semantics the adapter must respect; Trello has no such
 * notion and never sets it.
 */
export interface RemoteContainer {
  id: string
  name: string
  isTerminal?: boolean
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
  | { ok: false; errorKey: IntegrationErrorKey }

export interface PullContext {
  scope: RemoteScope
  mapping: StatusListMapping
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
}

export interface PushContext {
  scope: RemoteScope
  mapping: StatusListMapping
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
 * Props of a backend's own mapping step. Deliberately the same single prop
 * the generic step takes: everything else the step needs (the integration
 * slice, the store actions) it reads from the store itself.
 */
export interface MappingStepProps {
  onBack: () => void
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
   */
  MappingStep?: ComponentType<MappingStepProps>
  /** Pure factory: takes persisted config, returns a ready adapter. */
  create: (config: unknown) => TodoIntegration
  /**
   * Reads the scope out of a persisted config, or `null` while the user
   * hasn't picked one. The scope is deliberately *not* a separate persisted
   * field: it lives inside the config the adapter already owns, and only the
   * descriptor knows which keys make it up.
   */
  getScope: (config: unknown) => RemoteScope | null
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
