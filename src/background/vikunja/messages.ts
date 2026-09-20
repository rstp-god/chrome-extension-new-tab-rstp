/**
 * Shared vocabulary of the New Tab ↔ service worker bridge for Vikunja.
 *
 * Vikunja's API sends no `Access-Control-Allow-Origin` for
 * `chrome-extension://` origins, so the page cannot `fetch` it directly.
 * Background fetches made from the worker under host permissions are not
 * subject to CORS, hence this message hop.
 *
 * **Boundary rule:** this file is the ONLY module allowed to cross between
 * `src/background/vikunja/**` and `src/widgets/**`. Nothing under
 * `src/background/vikunja/` may import from `src/widgets/`, and the Vikunja
 * integration under `src/widgets/Todo/integrations/vikunja/` may import from
 * `src/background/` only through this file. `tests/contracts/vikunjaBoundary.test.ts`
 * enforces it.
 */

export const VIKUNJA_MSG = 'vikunja' as const

/**
 * The subset of the Todo widget's `IntegrationErrorKey` the bridge can
 * produce. Declared here rather than imported so the boundary rule above
 * holds; `tests/contracts/vikunja.types.test.ts` asserts assignability to
 * `IntegrationErrorKey` at the type level, so the two cannot drift apart.
 */
export const VIKUNJA_ERROR_KEYS = [
  'authInvalid',
  'network',
  'rateLimited',
  'notFound',
  'conflict',
  'permissionMissing',
  'unknown',
] as const

export type VikunjaErrorKey = (typeof VIKUNJA_ERROR_KEYS)[number]

/** Credentials as they travel over the wire. */
export interface VikunjaWire {
  /** baseUrl without trailing slash and without /api/v1 */
  baseUrl: string
  token: string
}

/**
 * Minimal task body. Task 6 finalises the field set (due dates, labels,
 * priority, …) once the mapping layer exists.
 */
export interface TaskPayload {
  title: string
  description?: string
  done?: boolean
}

export type VikunjaRequest =
  | { type: 'vikunja'; op: 'ping' }
  | { type: 'vikunja'; op: 'connect'; cfg: VikunjaWire }
  | { type: 'vikunja'; op: 'listProjects'; cfg: VikunjaWire }
  | { type: 'vikunja'; op: 'listBuckets'; cfg: VikunjaWire; projectId: number; viewId: number }
  | {
      type: 'vikunja'
      op: 'createBucket'
      cfg: VikunjaWire
      projectId: number
      viewId: number
      title: string
    }
  | { type: 'vikunja'; op: 'listLabels'; cfg: VikunjaWire }
  | { type: 'vikunja'; op: 'pull'; cfg: VikunjaWire; projectId: number; viewId: number }
  | { type: 'vikunja'; op: 'create'; cfg: VikunjaWire; projectId: number; payload: TaskPayload }
  | {
      type: 'vikunja'
      op: 'update'
      cfg: VikunjaWire
      taskId: number
      etag: string
      payload: Partial<TaskPayload>
    }
  | {
      type: 'vikunja'
      op: 'moveToBucket'
      cfg: VikunjaWire
      taskId: number
      projectId: number
      viewId: number
      bucketId: number
    }
  | { type: 'vikunja'; op: 'delete'; cfg: VikunjaWire; taskId: number }
  | {
      type: 'vikunja'
      op: 'setLabels'
      cfg: VikunjaWire
      taskId: number
      add: number[]
      remove: number[]
    }

/**
 * Runtime allowlist of the ops above. `isVikunjaRequest` checks against it,
 * so an `op` that reaches the dispatcher (and the failure log) is always one
 * of ours. `tests/contracts/vikunja.types.test.ts` pins it to the union so
 * the two cannot drift.
 */
export const VIKUNJA_OPS = [
  'ping',
  'connect',
  'listProjects',
  'listBuckets',
  'createBucket',
  'listLabels',
  'pull',
  'create',
  'update',
  'moveToBucket',
  'delete',
  'setLabels',
] as const satisfies readonly VikunjaRequest['op'][]

export type VikunjaOp = VikunjaRequest['op']

export type VikunjaResponse<T> = { ok: true; value: T } | { ok: false; errorKey: VikunjaErrorKey }

/** Payload of a successful `ping` — the bridge's own liveness probe. */
export interface VikunjaPing {
  pong: true
  at: number
}

/** Payload of a successful `connect`: who the token belongs to, on what instance. */
export interface VikunjaConnectInfo {
  /** Vikunja `username` of the token's owner. */
  userHandle: string
  /** `version` field of `GET /info`, e.g. `v2.6.0`. */
  version: string
}

/**
 * The one failure the bridge itself can produce (as opposed to an op
 * reporting a backend error). Frozen because both sides share this single
 * instance: the worker sends it, the client resolves with it.
 */
export const VIKUNJA_UNKNOWN_FAILURE: VikunjaResponse<never> = Object.freeze({
  ok: false,
  errorKey: 'unknown',
})

export type VikunjaBroadcast = {
  type: 'vikunja/pulled'
  projectId: number
  viewId: number
  at: number
}

/**
 * Discriminator for the worker's `onMessage` listener: tells "ours" from
 * "someone else's" so the other listener keeps its chance to answer, and
 * pins `op` to the allowlist so nothing attacker-chosen flows on into the
 * dispatcher or the failure log.
 *
 * It deliberately does NOT check `cfg` or the per-op fields — payload
 * validation belongs to the op handlers (tasks 4–7).
 */
export function isVikunjaRequest(msg: unknown): msg is VikunjaRequest {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as { type?: unknown; op?: unknown }
  if (candidate.type !== VIKUNJA_MSG || typeof candidate.op !== 'string') return false
  return (VIKUNJA_OPS as readonly string[]).includes(candidate.op)
}

const VIKUNJA_API_SUFFIX = '/api/v1'

/**
 * Canonical form of the instance root, shared by both sides of the bridge:
 * the connect form stores what this returns, the worker re-derives it from
 * whatever it is handed. One function, so a config written by the page and a
 * config validated by the worker can never disagree about what "the same
 * instance" means.
 *
 * Strips what users habitually paste around the root — a trailing slash and
 * the `/api/v1` copied out of the API docs — and returns `null` for anything
 * the client must not be pointed at:
 *
 * - a non-https scheme: the token rides on every request;
 * - credentials in the URL: they would be persisted next to the token;
 * - a query or a fragment: paths are concatenated onto this string, so
 *   anything after them would be swallowed or would reorder the final URL.
 *
 * A sub-path install (`https://host/vikunja/api/v1`) keeps its sub-path.
 */
export function normalizeVikunjaBaseUrl(raw: string): string | null {
  const trimmed = raw.trim()

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.search || url.hash) return null
  if (!url.hostname) return null

  let value = trimmed
  while (value.endsWith('/')) value = value.slice(0, -1)
  if (value.endsWith(VIKUNJA_API_SUFFIX)) value = value.slice(0, -VIKUNJA_API_SUFFIX.length)
  while (value.endsWith('/')) value = value.slice(0, -1)
  return value
}

/**
 * Chrome match pattern for the instance's host, as both sides must spell it:
 * the New Tab page passes it to `chrome.permissions.request` inside the user
 * gesture, the worker checks the very same string with
 * `chrome.permissions.contains`. Sharing one function is what keeps a granted
 * origin from reading as missing a moment later.
 *
 * Deliberately built from `hostname`, not `origin`: Chrome match patterns may
 * not carry a port, so `https://tasks.example:8443` has to be requested as
 * `https://tasks.example/*` or the call throws "Invalid value for origins".
 * The grant is therefore per-host rather than per-port — which is all Chrome's
 * permission model can express anyway.
 *
 * Returns `null` for anything unparseable or not https, so a caller can never
 * turn a junk baseUrl into a broad pattern.
 */
export function vikunjaHostPattern(baseUrl: string): string | null {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (!url.hostname) return null
  return `https://${url.hostname}/*`
}
