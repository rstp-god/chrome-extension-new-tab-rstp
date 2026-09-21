/**
 * Everything that reaches `chrome.storage` for the Todo widget, in one
 * place: the store itself only needs `todoEnvelopeSchema` plus the inferred
 * types. `withChromeSync` drops an envelope wholesale when it fails to
 * parse, so these shapes are a data-loss contract, not a formality.
 */

import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import { TODO_STATUSES } from '@/widgets/Todo/integrations/types.ts'
import { z } from 'zod'

import { upgradePersistedState } from './upgrade.ts'

import type { VikunjaPullPeriod } from '@/background/vikunja/messages.ts'

const linkedTabSchema = z.object({
  url: z.url(),
  title: z.string().nullable().optional(),
})

const trelloRemoteRefSchema = z.object({
  cardId: z.string(),
  shortLink: z.string().nullable(),
  listId: z.string(),
  etag: z.string().nullable(),
})

const vikunjaRemoteRefSchema = z.object({
  taskId: z.number(),
  /**
   * The board (Vikunja project) the task lives on — required, because a task
   * that does not say which board it belongs to cannot be found again once
   * there is more than one. Refs written by the single-board build gain it in
   * `upgradePersistedState`.
   */
  projectId: z.number().int().positive(),
  identifier: z.string(),
  bucketId: z.number().nullable(),
  updated: z.string(),
})

/**
 * Plain `z.union`, deliberately not `z.discriminatedUnion`: refs written by
 * the Trello-only build carry no discriminator field, so introducing one
 * would mean migrating every stored record. The two shapes are disjoint
 * (`cardId` vs `taskId`), so the first matching branch is always the right
 * one.
 */
const remoteTaskRefSchema = z.union([trelloRemoteRefSchema, vikunjaRemoteRefSchema])

const todoStatusSchema = z.enum(TODO_STATUSES)
const syncStateSchema = z.enum(['clean', 'dirty', 'error'])

const todoTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: todoStatusSchema,
  projectId: z.string().nullable(),
  createdAt: z.number(),
  statusChangedAt: z.number(),
  completedAt: z.number().nullable(),
  deletedAt: z.number().nullable(),
  linkedTab: linkedTabSchema.nullable(),
  // A half-written or foreign ref must never cost the user a task: the
  // envelope is parsed as a whole, and a single rejected task would drop the
  // entire list. Degrade to `null` instead — the next sync re-links it.
  remoteRef: remoteTaskRefSchema.nullable().catch(null),
  syncState: syncStateSchema,
})

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  pillClassName: z.string().nullable(),
})

/**
 * Multi-list per status. Explicit object (rather than `z.record`) so every
 * status is required and the inferred type is the full `StatusListMapping`.
 */
const statusListMappingSchema = z.object({
  input: z.array(z.string()).min(1),
  inprogress: z.array(z.string()).min(1),
  struggle: z.array(z.string()).min(1),
  completed: z.array(z.string()).min(1),
  deleted: z.array(z.string()).min(1),
})

const trelloConfigSchema = z.object({
  apiKey: z.string(),
  token: z.string(),
  boardId: z.string().nullable(),
})

const remoteListSchema = z.object({
  id: z.string(),
  name: z.string(),
})

/**
 * A container that may be the backend's own terminal ("done") or default
 * column. Only the Vikunja branch stores the flags — the Trello branch keeps
 * the narrower shape it has always written, so old records stay
 * byte-identical.
 */
const remoteContainerSchema = remoteListSchema.extend({
  isTerminal: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

const trelloIntegrationSchema = z.object({
  name: z.literal('trello'),
  config: trelloConfigSchema,
  /** Cached board name so the summary view stays zero-network. */
  boardName: z.string().nullable(),
  /** Cached lists for the chosen board, used by the mapping table + summary. */
  lists: z.array(remoteListSchema),
  /** Available projects (= Trello labels) on the chosen board. */
  projects: z.array(projectSchema),
  /** `null` until the user finishes the mapping wizard. */
  mapping: statusListMappingSchema.nullable(),
  lastSyncAt: z.number().nullable(),
})

/**
 * How often the service worker pulls the view in the background, in minutes.
 *
 * Annotated against the bridge's own `VikunjaPullPeriod` so the three literals
 * here and the `VIKUNJA_PULL_PERIODS_MIN` list the worker validates against
 * (and the select offers) cannot drift apart without breaking the build.
 */
const vikunjaPullPeriodSchema: z.ZodType<VikunjaPullPeriod> = z.union([
  z.literal(1),
  z.literal(5),
  z.literal(15),
])

/**
 * One board the widget syncs: a Vikunja project, its kanban view, and
 * everything that belongs to *that* board rather than to the connection —
 * the cached title, the buckets, the mapping the user built for them and
 * whether the buckets are used at all.
 *
 * All four used to live on the integration slice, where there was room for
 * exactly one of them. They are per board now, because two boards on the same
 * instance have different columns and the same status maps to a different
 * bucket in each.
 */
export const vikunjaBoardSchema = z.object({
  projectId: z.number().int().positive(),
  /** The project's kanban view — the only kind of view that has buckets. */
  viewId: z.number().int().positive(),
  /** Project title, cached so the summary stays zero-network. */
  name: z.string(),
  /** Buckets of the view, with the backend's own terminal/default flags. */
  containers: z.array(remoteContainerSchema),
  /** `null` until the wizard finished for **this** board. */
  mapping: statusListMappingSchema.nullable(),
  /** `false` → flat mode for this board: only done ↔ completed. */
  kanbanMapping: z.boolean(),
})

const vikunjaConfigSchema = z.object({
  // https-only: the token travels on every request, and a self-hosted
  // instance reachable over plain http would leak it on the wire. Hostname
  // stays unconstrained — `localhost` and bare IPs are normal for self-hosted.
  baseUrl: z.url({ protocol: /^https$/ }),
  token: z.string(),
  /**
   * Every board the connection syncs, in the order the user added them.
   * Empty while the wizard has not picked one — the `projectId: null` of the
   * single-board shape, without a second field to keep in step with it.
   */
  boards: z.array(vikunjaBoardSchema),
  /**
   * The board a new task is created on, or `null` when no board is picked.
   * An id, not an index, so adding or removing a board cannot silently
   * re-point it at a different one.
   */
  defaultProjectId: z.number().int().positive().nullable(),
  /**
   * Absent means the worker's default (5 min) — deliberately optional rather
   * than defaulted, so every config written before this setting existed stays
   * valid without a migration, and a user who never opened the select has
   * nothing about it in their storage.
   *
   * Per connection rather than per board: it is how often the worker talks to
   * the instance, which is a property of the instance and of the user's
   * patience, not of a column layout.
   */
  pullPeriodMin: vikunjaPullPeriodSchema.optional(),
})

/**
 * `boardName`, `lists` and `mapping` are a **mirror of the default board**
 * for as long as this branch keeps them.
 *
 * They are the single-board fields, and the whole widget still reads them —
 * the store's sync, the settings dialog's step, the summary, the wizard. The
 * upgrade therefore leaves them populated instead of moving the values away
 * from every one of their readers at once; task 2 (the contract hooks)
 * redirects those readers to `config.boards` and nulls the mirror, and
 * `projects` then holds the boards themselves.
 */
const vikunjaIntegrationSchema = z.object({
  name: z.literal('vikunja'),
  config: vikunjaConfigSchema,
  /** Cached project title of the default board — see above. */
  boardName: z.string().nullable(),
  /** Cached buckets of the default board's view — see above. */
  lists: z.array(remoteContainerSchema),
  /** Available projects (= Vikunja labels). */
  projects: z.array(projectSchema),
  /** `null` until the user finishes the mapping wizard — see above. */
  mapping: statusListMappingSchema.nullable(),
  lastSyncAt: z.number().nullable(),
})

/**
 * Discriminated on `name`, which records written by the Trello-only build
 * already carry (`name: 'trello'`) — so this widening costs no migration
 * either.
 *
 * Exported because the store re-validates every candidate integration slice
 * against it *before* `set`: config writes go through descriptor hooks that
 * take `unknown`, and this is the same schema that guards storage.
 */
export const integrationSchema = z.discriminatedUnion('name', [
  trelloIntegrationSchema,
  vikunjaIntegrationSchema,
])

/**
 * The state itself, behind the upgrade of anything written by an older build
 * (see `upgrade.ts`). The preprocess is a no-op — the same object back — for
 * every shape that is already current, so nothing but an old Vikunja config
 * is rewritten on its way through.
 */
const todoPersistedStateSchema = z.preprocess(
  upgradePersistedState,
  z.object({
    tasks: z.array(todoTaskSchema),
    integration: integrationSchema.nullable(),
  }),
)

/** The record `withChromeSync` reads from and writes to storage. */
export const todoEnvelopeSchema = makeEnvelopeSchema(todoPersistedStateSchema)

/**
 * The copy of the task list left behind when a connection goes away.
 *
 * Written right before a disconnect (or a switch to another integration),
 * because `clearIntegration` unlinks every task in place and there is no
 * undo: if the reconnect the user is about to make goes wrong, this is the
 * only record of what the list looked like. It is not part of the store's
 * own envelope — nothing reads it at runtime, and merging it into the state
 * the widget renders would make it a second source of truth.
 *
 * **It carries no config.** Not the token, not the instance URL, not the
 * board id — only what a human would want back. The snapshot outlives the
 * integration by design, so a secret in it would be one nobody is watching
 * any more; and since `z.object` strips what it does not declare, parsing a
 * candidate through this schema is what enforces that rather than a habit of
 * writing the right fields.
 */
export const todoHandoverSchema = z.object({
  version: z.literal(1),
  savedAt: z.number(),
  /** Which backend the tasks were linked to, for the user's own bearings. */
  integrationName: z.string(),
  boardName: z.string().nullable(),
  tasks: z.array(todoTaskSchema),
  /**
   * Set only when tasks were dropped from the tail to fit the byte budget, so
   * anyone reading the snapshot back knows it is not the whole list. Absent
   * means complete — the same "flags are written only when true" rule the
   * container schema above follows.
   */
  truncated: z.boolean().optional(),
})

/**
 * Ceiling on the snapshot, in bytes of its JSON.
 *
 * `chrome.storage.local` has a quota the whole extension shares, and this
 * record is dead weight the moment it is written — nothing reads it at
 * runtime. A user with thousands of tasks (or a few pathological ones) must
 * not lose a slice of their quota to a courtesy copy, so the tail is dropped
 * and `truncated` says so. 1.5 MB is generous for text: a typical task is a
 * few hundred bytes.
 */
export const TODO_HANDOVER_MAX_BYTES = 1_500_000

/**
 * How long the copy is worth keeping.
 *
 * It exists for the minutes or days between "I disconnected something" and "I
 * wish I hadn't". A month later it is a stale list of someone's tasks sitting
 * in storage for no reason, so the store drops it on the first load after it
 * expires.
 */
export const TODO_HANDOVER_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type LinkedTab = z.infer<typeof linkedTabSchema>
export type TodoTask = z.infer<typeof todoTaskSchema>
export type TodoSyncState = z.infer<typeof syncStateSchema>
export type TrelloConfig = z.infer<typeof trelloConfigSchema>
export type VikunjaBoard = z.infer<typeof vikunjaBoardSchema>
export type VikunjaConfig = z.infer<typeof vikunjaConfigSchema>
export type IntegrationState = z.infer<typeof integrationSchema>
export type TodoPersistedState = z.infer<typeof todoPersistedStateSchema>
export type TodoHandoverSnapshot = z.infer<typeof todoHandoverSchema>
