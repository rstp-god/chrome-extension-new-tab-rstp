import { z } from 'zod'

export const metaSchema = z.object({
  originId: z.string(),
  rev: z.number(),
  ts: z.number(),
})

export interface EnvelopeMeta {
  originId: string
  rev: number
  ts: number
}

/**
 * Canonical envelope shape used by chrome.storage records across the worker
 * (background/activity/storage.ts) and the UI (services/chrome/withChromeSync.ts).
 * Keep both sides in sync — rev-based conflict resolution depends on identical layout.
 */
export interface Envelope<T> {
  meta: EnvelopeMeta
  state: T
}

export function makeEnvelopeSchema<T extends z.ZodTypeAny>(stateSchema: T) {
  return z.object({
    meta: metaSchema,
    state: stateSchema,
  })
}
