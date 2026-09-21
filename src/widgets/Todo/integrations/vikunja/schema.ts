/**
 * Widget-side validation of what comes back across the bridge.
 *
 * `sendVikunjaMessage` validates only the envelope — `value` arrives as
 * `unknown` by design — so every caller parses the payload it asked for
 * before reading a field out of it.
 */

import { z } from 'zod'

import {
  VIKUNJA_ERROR_KEYS,
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
} from '@/background/vikunja/messages.ts'

import type {
  VikunjaBroadcast,
  VikunjaBucketSummary,
  VikunjaConnectInfo,
  VikunjaDeltaCounts,
  VikunjaProjectSummary,
  VikunjaPullResult,
  VikunjaPulledTask,
  VikunjaTaskWrite,
} from '@/background/vikunja/messages.ts'

/**
 * Annotated with the shared interface rather than inferring a second type
 * from the schema: the worker's `VikunjaConnectInfo` stays the single
 * definition, and a field added there without a matching line here stops
 * compiling.
 */
export const vikunjaConnectInfoSchema: z.ZodType<VikunjaConnectInfo> = z.object({
  userHandle: z.string(),
  version: z.string(),
})

/**
 * The rest of the read path, annotated the same way: `z.ZodType<T>` against
 * the worker's interface, so a field renamed in `messages.ts` breaks the
 * build here instead of returning `undefined` at runtime.
 */
export const vikunjaProjectSummarySchema: z.ZodType<VikunjaProjectSummary> = z.object({
  id: z.number(),
  title: z.string(),
  kanbanViewId: z.number().nullable(),
  isArchived: z.boolean(),
})

export const vikunjaProjectSummaryListSchema = z.array(vikunjaProjectSummarySchema)

export const vikunjaBucketSummarySchema: z.ZodType<VikunjaBucketSummary> = z.object({
  id: z.number(),
  title: z.string(),
  isDone: z.boolean(),
  isDefault: z.boolean(),
})

export const vikunjaBucketSummaryListSchema = z.array(vikunjaBucketSummarySchema)

export const vikunjaPulledTaskSchema: z.ZodType<VikunjaPulledTask> = z.object({
  id: z.number(),
  identifier: z.string(),
  // The same ceilings the worker truncates to: a payload over them did not
  // come from our own `pull`, and the widget refuses it rather than
  // persisting it.
  title: z.string().max(VIKUNJA_MAX_TITLE_LENGTH),
  description: z.string().max(VIKUNJA_MAX_DESCRIPTION_LENGTH),
  done: z.boolean(),
  doneAt: z.string().nullable(),
  bucketId: z.number(),
  created: z.string(),
  updated: z.string(),
})

export const vikunjaPullResultSchema: z.ZodType<VikunjaPullResult> = z.object({
  tasks: z.array(vikunjaPulledTaskSchema),
  pulledAt: z.number(),
})

/** How much moved, as the broadcast reports it: counts, never ids. */
export const vikunjaDeltaCountsSchema: z.ZodType<VikunjaDeltaCounts> = z.object({
  added: z.number(),
  changed: z.number(),
  removed: z.number(),
})

/**
 * What the worker's background pull broadcasts, validated on arrival.
 *
 * `isVikunjaBroadcast` only proves the `type`; this is what makes the counts
 * and the error key safe to act on. The channel is shared with the Tab Rules
 * traffic, so "the worker sent it" is an assumption the subscriber checks
 * (see `isOwnWorker`) rather than a fact — and a `projectId` that is not a
 * number would leak straight into its scope filter.
 */
export const vikunjaBroadcastSchema: z.ZodType<VikunjaBroadcast> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('vikunja/pulled'),
    projectId: z.number(),
    viewId: z.number(),
    at: z.number(),
    delta: vikunjaDeltaCountsSchema,
  }),
  z.object({
    type: z.literal('vikunja/pull-failed'),
    projectId: z.number(),
    viewId: z.number(),
    at: z.number(),
    errorKey: z.enum(VIKUNJA_ERROR_KEYS),
  }),
])

/**
 * What every mutation answers with. Parsed even though the worker built it:
 * the bridge types `value` as `unknown`, and a ref assembled from an
 * unvalidated payload would be persisted — a `taskId` that is not a number
 * addresses nothing and can never be repaired by a later sync.
 */
export const vikunjaTaskWriteSchema: z.ZodType<VikunjaTaskWrite> = z.object({
  id: z.number(),
  identifier: z.string(),
  bucketId: z.number(),
  done: z.boolean(),
  doneAt: z.string().nullable(),
  updated: z.string(),
})
