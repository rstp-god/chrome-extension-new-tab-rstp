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
 * Everything the widget may write to a task, and nothing else.
 *
 * Deliberately three fields. `POST /tasks/:id` is a **full replace** (recon
 * Q9), so the worker has to read the task, merge this patch into the raw
 * record and write the whole thing back; every field listed here is a field
 * the user's own instance can lose to a bug, and none of the rest
 * (`due_date`, `priority`, `percent_done`, assignees, reminders) is something
 * the widget can even show, let alone edit. Labels are not here either: they
 * have their own endpoints (`setLabels`) and are not part of the task body.
 *
 * `description` is **HTML**, already produced by the widget's `textToHtml` —
 * Vikunja stores rich text in this field and would render an escaped string
 * as literal markup.
 *
 * `done` is only ever sent in flat mode. In kanban mode a move into the
 * view's done bucket sets it server-side (recon Q7), so sending it as well
 * would be a second request for an effect that already happened.
 */
export interface TaskPayload {
  title: string
  description?: string
  done?: boolean
}

/**
 * What a mutation answers with: the identity of the task plus the three
 * fields the widget's ref and its card actually depend on.
 *
 * Not the whole task — the bridge is a `structuredClone` boundary and the
 * widget has no use for the other forty fields it would then have to
 * re-validate.
 *
 * `bucketId` is `0` when the response cannot say (the global task endpoints
 * do not fill `bucket_id` — recon Q3); the widget keeps its last known bucket
 * in that case rather than believing the zero.
 *
 * `updated` is already normalised to whole seconds, so it can be stored as
 * the ref's etag and compared with the next read without a false conflict
 * (recon Q16).
 */
export interface VikunjaTaskWrite {
  id: number
  identifier: string
  bucketId: number
  done: boolean
  doneAt: string | null
  updated: string
}

/**
 * What `setLabels` actually changed — not what it was asked to change. A
 * reserved label (see `isReservedVikunjaLabel`) is never removed and a label
 * the task does not carry is not removed twice, so the two lists can be
 * shorter than the request's.
 */
export interface VikunjaSetLabelsResult {
  added: number[]
  removed: number[]
}

/** `DELETE /tasks/:id` carries no payload worth forwarding. */
export interface VikunjaDeleteResult {
  deleted: true
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
  | {
      type: 'vikunja'
      op: 'pull'
      cfg: VikunjaWire
      projectId: number
      viewId: number
      /**
       * Bypass the worker's snapshot cache and really read the view.
       *
       * A pull is expensive — one request per page of every bucket against
       * someone's own server — and the background alarm already refreshes the
       * snapshot on its own schedule. So a sync the *widget* only started
       * because the worker told it something changed (`vikunja/pulled`) sends
       * `false` and is answered from the snapshot the broadcast was about;
       * a sync the user asked for, or a freshly mounted widget, sends `true`.
       *
       * Optional and defaulting to "not forced": an omitted flag is the cheap
       * answer, which is the safe one to give a caller that never thought
       * about it.
       */
      force?: boolean
    }
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
 * A project the credentials can reach, trimmed to what the scope picker
 * needs. Deliberately not the raw `GET /projects` record: the bridge is a
 * `structuredClone` boundary, and shipping the full object across it would
 * hand the widget every field of the user's instance to re-validate.
 *
 * `kanbanViewId` is `null` when the project has no kanban view — such a
 * project cannot be mapped to buckets and the adapter skips it. It comes from
 * the `views[]` embedded in `GET /projects` (recon Q5/§2.7), so the scope
 * picker costs one request. The view's done and default bucket ids are not
 * repeated here: only `listBuckets` needs them, and it reads the view anyway
 * to flag the buckets it returns.
 */
export interface VikunjaProjectSummary {
  id: number
  title: string
  kanbanViewId: number | null
  isArchived: boolean
}

/**
 * One bucket (kanban column) of the chosen view.
 *
 * `isDone` marks the view's own done bucket — moving a task there flips
 * `done` server-side (recon Q7), which is why the mapping wizard treats it as
 * the only sensible home for `completed`.
 *
 * `isDefault` marks the view's `default_bucket_id`: where Vikunja itself puts
 * a new task, and where a task leaving the done bucket lands (recon Q8). Flat
 * mode points everything but `completed` at it, so it is not a cosmetic flag.
 */
export interface VikunjaBucketSummary {
  id: number
  title: string
  isDone: boolean
  isDefault: boolean
}

/** A label, which the Todo widget surfaces as a "project". */
export interface VikunjaLabelSummary {
  id: number
  title: string
  /** `hex_color` without a leading `#`, or `null` when the label has none. */
  hexColor: string | null
}

/**
 * Ceilings on the two free-text fields a pulled task carries.
 *
 * A Vikunja title has no server-side limit worth relying on and a description
 * is rich text, so a single pathological task could otherwise push megabytes
 * through `structuredClone` on this bridge and then into
 * `chrome.storage.local`, whose quota the whole widget shares. The widget
 * shows a card, not a document: truncating is the honest failure mode.
 *
 * Part of the bridge vocabulary rather than of the worker's own constants
 * because both sides need them — the worker truncates to them, the widget's
 * schema refuses anything longer.
 */
export const VIKUNJA_MAX_TITLE_LENGTH = 1024
export const VIKUNJA_MAX_DESCRIPTION_LENGTH = 16_384

/**
 * Label prefixes that belong to another feature of the user's own workflow.
 *
 * The instance this integration was built against already uses `energy:*` and
 * `mood:*` labels for something else (recon Q13). The widget pretends not to
 * see them — surfacing them as Todo "projects" would bury the real ones — and,
 * more importantly, the **write path must never strip one off a task it
 * edits**: a sync that quietly deletes someone's labels is worse than no sync.
 *
 * Shared vocabulary rather than a widget constant because both sides enforce
 * it: the widget hides them, and the worker drops them from a `setLabels`
 * removal list — a renderer asking for a reserved id is refused there, not
 * trusted. One list, so the two checks cannot disagree.
 */
export const VIKUNJA_RESERVED_LABEL_PREFIXES = ['energy:', 'mood:'] as const

/** Is this one of the labels another feature owns (see the list above)? */
export function isReservedVikunjaLabel(title: string): boolean {
  const normalized = title.trim().toLowerCase()
  return VIKUNJA_RESERVED_LABEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

/**
 * One task as the pull hands it over.
 *
 * `bucketId` is the bucket the task was *found in*, not the task's own
 * `bucket_id` field — outside a view response that field is `0` (recon Q3).
 *
 * `updated` is already normalised to whole seconds (see
 * `normalizeVikunjaTimestamp`), so it can be compared with the etag stored on
 * the local task without a false conflict on every other edit.
 */
export interface VikunjaPulledTask {
  id: number
  identifier: string
  title: string
  /** Rich text: Vikunja stores HTML here. */
  description: string
  done: boolean
  /** `null` when unset — the `0001-01-01` sentinel never reaches this side. */
  doneAt: string | null
  bucketId: number
  created: string
  updated: string
  labelIds: number[]
}

/**
 * How much moved between the previous full read of a view and the current
 * one, as three counts.
 *
 * Counts, not ids: the delta travels inside a broadcast to every open New Tab
 * page, and no page has a use for the ids — it answers a non-empty delta by
 * syncing, which reads the tasks anyway. The ids stay inside the worker,
 * where the comparison is made.
 *
 * - `added`: tasks the previous snapshot did not have (all of them, on the
 *   first pull of a view);
 * - `changed`: tasks whose `updated`, bucket or `done` moved;
 * - `removed`: tasks the previous snapshot had and this one does not, which
 *   for a **full** read of the view means deleted (or moved out) remotely.
 *
 * `removed` is the reason the pull is always full and never filtered by
 * `updated` (recon §2.2): an incremental read cannot report a deletion at all.
 */
export interface VikunjaDeltaCounts {
  added: number
  changed: number
  removed: number
}

/**
 * What the `pull` op answers with.
 *
 * Deliberately no delta: the widget reconciles the whole list it is handed
 * and has no use for "what changed" — the worker keeps that for itself, to
 * decide whether a broadcast is worth sending.
 */
export interface VikunjaPullResult {
  tasks: VikunjaPulledTask[]
  /** When the worker finished the read, for the widget's "last synced" line. */
  pulledAt: number
}

/**
 * How many of a sync's pushes the widget may have in flight at once.
 *
 * Shared vocabulary rather than a widget constant because the number is a
 * statement about the *worker*: its `mutationQueue` serialises writes per task
 * id (and per project for creates), which is the only reason a pool is safe
 * here at all. The widget's descriptor spends it as `pushConcurrency`.
 */
export const VIKUNJA_MUTATION_CONCURRENCY = 4

/**
 * Pull periods the user may pick, in minutes, and the one they get when they
 * never do.
 *
 * Both sides need them: the widget's persisted config schema and its select
 * are built from this list, and the worker refuses anything outside it before
 * handing a number to `chrome.alarms` — so a hand-edited storage record
 * cannot turn the background pull into a per-second hammer on someone's
 * self-hosted instance. One list, so the picker and the validator cannot
 * disagree. `src/background/vikunja/constants.ts` re-exports them for the
 * worker side.
 */
export const VIKUNJA_PULL_PERIODS_MIN = [1, 5, 15] as const

export type VikunjaPullPeriod = (typeof VIKUNJA_PULL_PERIODS_MIN)[number]

/** Five minutes: often enough to feel live, rare enough to be unnoticeable. */
export const VIKUNJA_PULL_PERIOD_MIN: VikunjaPullPeriod = 5

/**
 * Truncates an API timestamp to whole seconds.
 *
 * Mutation responses carry nanoseconds (`…:54.988820952+03:00`) while the
 * next `GET` answers seconds (`…:54+03:00`) — recon Q16. An etag taken from a
 * mutation would therefore never match the following read and would report a
 * conflict on every second edit (recon §2.3). Normalising both sides through
 * this one function is what keeps the comparison meaningful.
 *
 * An unparseable string is returned unchanged: it is a schema problem, not a
 * precision problem, and silently turning it into the epoch would be worse.
 */
export function normalizeVikunjaTimestamp(iso: string): string {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return iso
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString()
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

/**
 * What the worker's background pull tells the open New Tab pages, on its own
 * initiative — the one direction of the bridge that is not a reply.
 *
 * Deliberately not a `VikunjaRequest`: it travels the same
 * `chrome.runtime.sendMessage` channel but in the opposite direction, carries
 * no credentials, and expects no answer. The `vikunja/…` prefix keeps it out
 * of `isVikunjaRequest`'s allowlist, so a broadcast can never be mistaken for
 * an op the worker should run.
 *
 * `vikunja/pulled` means "the view moved, ask me for it"; the counts are
 * there so a page can tell a real change from a no-op without a round trip.
 * `vikunja/pull-failed` is the counterpart the widget could otherwise never
 * learn about: the alarm runs while no page is looking, and a revoked token
 * or a host permission the user withdrew has to reach the UI somehow.
 */
export type VikunjaBroadcast =
  | {
      type: 'vikunja/pulled'
      projectId: number
      viewId: number
      at: number
      delta: VikunjaDeltaCounts
    }
  | {
      type: 'vikunja/pull-failed'
      projectId: number
      viewId: number
      at: number
      errorKey: VikunjaErrorKey
    }

export const VIKUNJA_BROADCAST_TYPES = [
  'vikunja/pulled',
  'vikunja/pull-failed',
] as const satisfies readonly VikunjaBroadcast['type'][]

/**
 * Discriminator for the widget's `onMessage` listener, mirroring
 * `isVikunjaRequest` on the other side: it tells a broadcast of ours from the
 * Tab Rules traffic sharing the channel, and nothing more. The payload is
 * re-validated with Zod by the subscriber before a field is read out of it —
 * the sender is the worker, but the channel is not exclusively ours.
 */
export function isVikunjaBroadcast(msg: unknown): msg is VikunjaBroadcast {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as { type?: unknown }
  return (
    typeof candidate.type === 'string' &&
    (VIKUNJA_BROADCAST_TYPES as readonly string[]).includes(candidate.type)
  )
}

/**
 * Discriminator for the worker's `onMessage` listener: tells "ours" from
 * "someone else's" so the other listener keeps its chance to answer, and
 * pins `op` to the allowlist so nothing attacker-chosen flows on into the
 * dispatcher or the failure log.
 *
 * It deliberately does NOT check `cfg` or the per-op fields — payload
 * validation belongs to the op handlers in `handlers.ts`.
 */
export function isVikunjaRequest(msg: unknown): msg is VikunjaRequest {
  if (typeof msg !== 'object' || msg === null) return false
  const candidate = msg as { type?: unknown; op?: unknown }
  if (candidate.type !== VIKUNJA_MSG || typeof candidate.op !== 'string') return false
  return (VIKUNJA_OPS as readonly string[]).includes(candidate.op)
}

/**
 * Is this a literal host we may put into a Chrome match pattern?
 *
 * **Security-critical.** `new URL()` accepts hosts a match pattern reads as a
 * wildcard: `https://*`, `https://%2A` (percent-decoded to `*`) and
 * `https://*.example.com` all parse, and interpolating one of them would turn
 * the connect form's request into the maximal grant — every https host —
 * while the worker's `permissions.contains` gate would then pass for all of
 * them too.
 *
 * So only literal hosts are allowed: dot-separated labels of `a-z`, `0-9` and
 * `-` (which also covers an IPv4 literal). No `*`, and no bracketed IPv6
 * literal — Chrome cannot express one in a match pattern anyway, so a `[::1]`
 * instance is refused up front instead of failing later inside
 * `permissions.request`.
 *
 * `new URL` has already lower-cased and punycoded the host by the time this
 * runs, so an IDN instance arrives as ASCII and passes.
 */
const LITERAL_HOSTNAME_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/

function isLiteralHostname(hostname: string): boolean {
  return LITERAL_HOSTNAME_RE.test(hostname)
}

/**
 * Drops trailing slashes and a trailing `/api/v1` (case-insensitively, and
 * repeatedly, so the result is a fixed point). Repetition is what makes
 * `normalizeVikunjaBaseUrl` idempotent: without it `/api/v1/api/v1` would
 * normalise to `/api/v1`, which a second pass would shorten again — and the
 * config the form persisted would stop matching the config the worker
 * derives.
 */
function stripApiSuffix(pathname: string): string {
  let path = pathname
  for (;;) {
    const next = path.replace(/\/+$/, '').replace(/\/api\/v1$/i, '')
    if (next === path) return next
    path = next
  }
}

/**
 * Canonical form of the instance root, shared by both sides of the bridge:
 * the connect form stores what this returns, the worker re-derives it from
 * whatever it is handed. One function, so a config written by the page and a
 * config validated by the worker can never disagree about what "the same
 * instance" means — which also means it must be idempotent, and there is a
 * test pinning that.
 *
 * The result is rebuilt from the *parsed* URL (`origin` + cleaned pathname),
 * never by cutting the raw string: `https://api/v1` is a host called `api`
 * with a `/v1` path, not an API root, and only the parser knows that.
 *
 * Returns `null` for anything the client must not be pointed at:
 *
 * - a non-https scheme: the token rides on every request;
 * - a host that is not literal (see `isLiteralHostname`);
 * - credentials in the URL: they would be persisted next to the token;
 * - a query or a fragment: paths are concatenated onto this string, so
 *   anything after them would be swallowed or would reorder the final URL.
 *
 * A sub-path install (`https://host/vikunja/api/v1`) keeps its sub-path.
 */
export function normalizeVikunjaBaseUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.search || url.hash) return null
  if (!isLiteralHostname(url.hostname)) return null

  // `origin` carries the lower-cased host and the port when it is not 443.
  return `${url.origin}${stripApiSuffix(url.pathname)}`
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
 * The grant is therefore per-host and covers every port of that host — which
 * is all Chrome's permission model can express.
 *
 * Returns `null` unless the URL is https with a literal host, so no caller —
 * not even one skipping `normalizeVikunjaBaseUrl` — can turn a wildcard host
 * into a wildcard grant.
 */
export function vikunjaHostPattern(baseUrl: string): string | null {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (!isLiteralHostname(url.hostname)) return null
  return `https://${url.hostname}/*`
}

/**
 * Which of the configured boards is "the board" for a caller that has not
 * been told: the one `defaultProjectId` names, the first one when it names
 * nothing (or names a board no longer in the list), and `null` when none is
 * connected.
 *
 * Structural on purpose — it asks for `projectId` and answers with whatever
 * was passed in — so the two sides of the bridge can share the rule without
 * sharing a type. The worker's board is the three fields its schedule schema
 * reads; the widget's is the full `VikunjaBoard`. Both would otherwise
 * implement "the default board" separately, and the pull would drift from
 * what the page is showing.
 *
 * Lives here because this is the one module both sides may import (see the
 * boundary rule at the top of this file), and because the rule is part of
 * the persisted config's meaning rather than of either side's UI.
 */
export function defaultVikunjaBoard<TBoard extends { projectId: number }>(config: {
  boards: readonly TBoard[]
  defaultProjectId: number | null
}): TBoard | null {
  const [first] = config.boards
  if (first === undefined) return null
  if (config.defaultProjectId === null) return first

  return config.boards.find((board) => board.projectId === config.defaultProjectId) ?? first
}
