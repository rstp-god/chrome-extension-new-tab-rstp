/**
 * The gate every networked Vikunja operation passes through, and the config
 * schema it is built on.
 *
 * Split out of `handlers.ts` because the gate has a second caller that is not
 * a bridge op at all: the background pull, which `chrome.alarms` starts with
 * no page and no message involved (`pull.ts` / `alarm.ts`). Importing it from
 * `handlers.ts` would make `handlers → pull → handlers` a live import cycle,
 * and the alternative — a second copy of the checks for the alarm — is
 * exactly the drift this module exists to prevent. `handlers.ts` re-exports
 * both names, so every historical import path still resolves.
 */

import { z } from 'zod'

import { VikunjaClient } from '@/background/vikunja/client.ts'
import {
  normalizeVikunjaBaseUrl,
  vikunjaHostPattern,
  VIKUNJA_UNKNOWN_FAILURE,
} from '@/background/vikunja/messages.ts'

import type { VikunjaResponse } from '@/background/vikunja/messages.ts'

/**
 * The worker's own view of the credentials. The page validates too, but the
 * page is the untrusted side of the bridge — this is the check that counts,
 * and it runs before a single byte reaches the network.
 *
 * https-only (the token travels on every request) and literal-host-only via
 * the shared normaliser, so a config the form wrote and a config the worker
 * accepts can never disagree. The 4096-char ceiling keeps a pathological
 * "token" out of a header.
 */
export const vikunjaWireSchema = z.object({
  baseUrl: z
    .string()
    .max(2048)
    .refine((raw) => normalizeVikunjaBaseUrl(raw) !== null)
    // Unreachable fallback: `refine` above rejects everything the normaliser
    // cannot canonicalise.
    .transform((raw) => normalizeVikunjaBaseUrl(raw) ?? raw),
  token: z.string().min(1).max(4096),
})

/**
 * `chrome.permissions` is read through `globalThis` rather than the ambient
 * `chrome` binding so a missing API degrades to "not granted" instead of
 * throwing a ReferenceError wherever `chrome` is absent.
 */
async function hasHostPermission(pattern: string): Promise<boolean> {
  const permissions = (globalThis as { chrome?: typeof chrome }).chrome?.permissions
  if (!permissions?.contains) return false
  try {
    return await permissions.contains({ origins: [pattern] })
  } catch {
    // A pattern Chrome cannot represent throws rather than answering false.
    return false
  }
}

/**
 * The gate every networked op goes through: validate the config, derive the
 * host pattern, confirm the user actually granted that host, and only then
 * hand a ready client to `run`.
 *
 * It exists as a wrapper rather than as a preamble each handler copies so no
 * caller — a bridge op or the background alarm — can skip a step. Order
 * matters: a malformed config and a missing host permission both answer
 * without touching the network, so a compromised renderer cannot use the
 * worker as an open proxy to hosts the user never approved.
 *
 * The permission is re-checked on every operation, not once at connect time:
 * the user can revoke an optional host at any moment from `chrome://settings`,
 * and a worker that cached the answer would keep sending the token.
 *
 * `chrome.permissions.request` is deliberately never called from here — it
 * needs a user gesture, which only a page has. The worker may check, never ask.
 */
export async function withVikunjaClient<T>(
  cfg: unknown,
  run: (client: VikunjaClient) => Promise<VikunjaResponse<T>>,
): Promise<VikunjaResponse<T>> {
  const parsed = vikunjaWireSchema.safeParse(cfg)
  if (!parsed.success) return VIKUNJA_UNKNOWN_FAILURE

  const { baseUrl, token } = parsed.data
  const pattern = vikunjaHostPattern(baseUrl)
  if (!pattern) return VIKUNJA_UNKNOWN_FAILURE

  if (!(await hasHostPermission(pattern))) {
    return { ok: false, errorKey: 'permissionMissing' }
  }

  return run(new VikunjaClient(baseUrl, token))
}
