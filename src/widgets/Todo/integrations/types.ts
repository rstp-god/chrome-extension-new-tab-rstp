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

export interface RemoteBoard {
  id: string
  name: string
}

export interface RemoteList {
  id: string
  name: string
}

/** Pointer to the remote record for a local task. */
export interface RemoteTaskRef {
  cardId: string
  shortLink: string | null
  /** Last observed remote list id — lets us detect drift on next pull. */
  listId: string
  /** Last-known `dateLastActivity`, used as a cheap etag. */
  etag: string | null
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
  | 'unknown'

export type IntegrationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; errorKey: IntegrationErrorKey }

export interface PullContext {
  boardId: string
  mapping: StatusListMapping
  /** Existing local refs keyed by local task id, used by `reconcile`. */
  knownRefs: Record<string, RemoteTaskRef>
}

export interface PushContext {
  boardId: string
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

  listBoards(): Promise<IntegrationOutcome<RemoteBoard[]>>
  listLists(boardId: string): Promise<IntegrationOutcome<RemoteList[]>>
  listProjects(boardId: string): Promise<IntegrationOutcome<Project[]>>

  /**
   * Full pull of every visible card on the configured board. The adapter
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
}

export interface ConnectFormProps {
  busy: boolean
  errorKey: IntegrationErrorKey | null
  onConnect: (config: unknown) => Promise<void>
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
  /** Pure factory: takes persisted config, returns a ready adapter. */
  create: (config: unknown) => TodoIntegration
}
