/**
 * Everything that reaches `chrome.storage` for the Todo widget, in one
 * place: the store itself only needs `todoEnvelopeSchema` plus the inferred
 * types. `withChromeSync` drops an envelope wholesale when it fails to
 * parse, so these shapes are a data-loss contract, not a formality.
 */

import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import { TODO_STATUSES } from '@/widgets/Todo/integrations/types.ts'
import { z } from 'zod'

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

const vikunjaConfigSchema = z.object({
  // https-only: the token travels on every request, and a self-hosted
  // instance reachable over plain http would leak it on the wire. Hostname
  // stays unconstrained — `localhost` and bare IPs are normal for self-hosted.
  baseUrl: z.url({ protocol: /^https$/ }),
  token: z.string(),
  projectId: z.number().nullable(),
  viewId: z.number().nullable(),
  /** `false` → flat mode: only done ↔ completed, buckets are ignored. */
  kanbanMapping: z.boolean(),
})

const vikunjaIntegrationSchema = z.object({
  name: z.literal('vikunja'),
  config: vikunjaConfigSchema,
  /** Cached project title — the Vikunja counterpart of a Trello board name. */
  boardName: z.string().nullable(),
  /** Cached buckets of the chosen view. */
  lists: z.array(remoteContainerSchema),
  /** Available projects (= Vikunja labels). */
  projects: z.array(projectSchema),
  /** `null` until the user finishes the mapping wizard. */
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

const todoPersistedStateSchema = z.object({
  tasks: z.array(todoTaskSchema),
  integration: integrationSchema.nullable(),
})

/** The record `withChromeSync` reads from and writes to storage. */
export const todoEnvelopeSchema = makeEnvelopeSchema(todoPersistedStateSchema)

export type LinkedTab = z.infer<typeof linkedTabSchema>
export type TodoTask = z.infer<typeof todoTaskSchema>
export type TodoSyncState = z.infer<typeof syncStateSchema>
export type TrelloConfig = z.infer<typeof trelloConfigSchema>
export type VikunjaConfig = z.infer<typeof vikunjaConfigSchema>
export type IntegrationState = z.infer<typeof integrationSchema>
export type TodoPersistedState = z.infer<typeof todoPersistedStateSchema>
