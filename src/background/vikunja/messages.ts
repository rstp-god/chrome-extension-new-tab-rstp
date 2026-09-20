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

export type VikunjaOp = VikunjaRequest['op']

export type VikunjaResponse<T> = { ok: true; value: T } | { ok: false; errorKey: VikunjaErrorKey }

export type VikunjaBroadcast = {
  type: 'vikunja/pulled'
  projectId: number
  viewId: number
  at: number
}

/**
 * Cheap discriminator for the worker's `onMessage` listener: it only has to
 * tell "ours" from "someone else's" so the other listener keeps its chance
 * to answer. It deliberately does NOT validate `op` against the known set or
 * check `cfg` — the dispatcher rejects unknown ops, and payload validation
 * belongs to the op handlers (tasks 4–7).
 */
export function isVikunjaRequest(msg: unknown): msg is VikunjaRequest {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as { type?: unknown; op?: unknown }
  return candidate.type === VIKUNJA_MSG && typeof candidate.op === 'string'
}
