/**
 * Per-op handlers behind the bridge, plus the dispatcher that picks between
 * them. Split out of `index.ts` so that file stays what it says on the tin:
 * listener registration and the `chrome.runtime` plumbing around it.
 *
 * Nothing here trusts the message it is handed. `isVikunjaRequest` only
 * proves `type` and `op`; every payload field is re-validated with Zod before
 * it reaches a URL, because the sender is a renderer process and a renderer
 * can be compromised.
 */

import { z } from 'zod'

import { VikunjaClient } from '@/background/vikunja/client.ts'
import {
  normalizeVikunjaBaseUrl,
  vikunjaHostPattern,
  VIKUNJA_UNKNOWN_FAILURE,
} from '@/background/vikunja/messages.ts'

import type {
  VikunjaConnectInfo,
  VikunjaPing,
  VikunjaRequest,
  VikunjaResponse,
} from '@/background/vikunja/messages.ts'

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
 * It exists as a wrapper rather than as a preamble each handler copies so the
 * ops arriving in tasks 5–7 cannot skip a step. Order matters: a malformed
 * config and a missing host permission both answer without touching the
 * network, so a compromised renderer cannot use the worker as an open proxy
 * to hosts the user never approved.
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

/** Validates credentials against a live instance. */
export function handleConnect(
  req: Extract<VikunjaRequest, { op: 'connect' }>,
): Promise<VikunjaResponse<VikunjaConnectInfo>> {
  return withVikunjaClient(req.cfg, async (client) => {
    // `/info` first: it is the cheap, usually unauthenticated probe that tells
    // "this is a Vikunja instance" apart from "this token is wrong".
    const info = await client.getInfo()
    if (!info.ok) return info

    const user = await client.getCurrentUser()
    if (!user.ok) return user

    return { ok: true, value: { userHandle: user.value.username, version: info.value.version } }
  })
}

/**
 * Dispatcher. `ping` and `connect` are wired up; the remaining ops answer
 * `unknown` until tasks 5–7 implement them, rather than pretending to work.
 */
export async function handleVikunjaRequest(req: VikunjaRequest): Promise<VikunjaResponse<unknown>> {
  switch (req.op) {
    case 'ping': {
      const value: VikunjaPing = { pong: true, at: Date.now() }
      return { ok: true, value }
    }

    case 'connect':
      return handleConnect(req)

    default:
      return VIKUNJA_UNKNOWN_FAILURE
  }
}
