/**
 * Widget-side validation of what comes back across the bridge.
 *
 * `sendVikunjaMessage` validates only the envelope — `value` arrives as
 * `unknown` by design — so every caller parses the payload it asked for
 * before reading a field out of it.
 */

import { z } from 'zod'

import type { VikunjaConnectInfo } from '@/background/vikunja/messages.ts'

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
