import { z } from "zod";

export const metaSchema = z.object({
  originId: z.string(),
  rev: z.number(),
  ts: z.number(),
});

export function makeEnvelopeSchema<T extends z.ZodTypeAny>(stateSchema: T) {
  return z.object({
    meta: metaSchema,
    state: stateSchema,
  });
}
