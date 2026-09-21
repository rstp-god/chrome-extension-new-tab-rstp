/**
 * Widget-side validation of what comes back across the bridge.
 *
 * `sendVikunjaMessage` validates only the envelope — `value` arrives as
 * `unknown` by design — so every caller parses the payload it asked for
 * before reading a field out of it.
 */

import { z } from 'zod'

import {
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
} from '@/background/vikunja/messages.ts'

import type {
  VikunjaBucketSummary,
  VikunjaConnectInfo,
  VikunjaLabelSummary,
  VikunjaProjectSummary,
  VikunjaPullResult,
  VikunjaPulledTask,
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

export const vikunjaLabelSummarySchema: z.ZodType<VikunjaLabelSummary> = z.object({
  id: z.number(),
  title: z.string(),
  hexColor: z.string().nullable(),
})

export const vikunjaLabelSummaryListSchema = z.array(vikunjaLabelSummarySchema)

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
  labelIds: z.array(z.number()),
})

export const vikunjaPullResultSchema: z.ZodType<VikunjaPullResult> = z.object({
  tasks: z.array(vikunjaPulledTaskSchema),
  pulledAt: z.number(),
})
