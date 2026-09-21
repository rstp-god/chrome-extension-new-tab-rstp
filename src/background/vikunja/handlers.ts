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
  isReservedVikunjaLabel,
  normalizeVikunjaBaseUrl,
  normalizeVikunjaTimestamp,
  vikunjaHostPattern,
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
  VIKUNJA_UNKNOWN_FAILURE,
} from '@/background/vikunja/messages.ts'

import type {
  VikunjaBucketSummary,
  VikunjaConnectInfo,
  VikunjaDeleteResult,
  VikunjaLabelSummary,
  VikunjaPing,
  VikunjaProjectSummary,
  VikunjaPullResult,
  VikunjaPulledTask,
  VikunjaRequest,
  VikunjaResponse,
  VikunjaSetLabelsResult,
  VikunjaTaskWrite,
} from '@/background/vikunja/messages.ts'
import type {
  VikunjaBucket,
  VikunjaLabel,
  VikunjaProject,
  VikunjaTask,
  VikunjaView,
} from '@/background/vikunja/schema.ts'

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

/**
 * Ids as they arrive from the renderer. The message union types them as
 * `number`, but a type is not a check: these values end up interpolated into
 * a request path, so a fractional, negative or NaN id is refused here rather
 * than being pasted into a URL.
 */
const vikunjaScopeSchema = z.object({
  projectId: z.number().int().positive(),
  viewId: z.number().int().positive(),
})

/**
 * A column title the wizard asks us to create. Bounded because it travels
 * into a request body, and non-empty after trimming because Vikunja would
 * otherwise create an unnamed column the user cannot tell apart.
 */
const vikunjaBucketTitleSchema = z
  .string()
  .max(250)
  .transform((raw) => raw.trim())
  .refine((title) => title.length > 0)

/**
 * One id on its own, for the ops that address a task rather than a scope.
 * Same reasoning as `vikunjaScopeSchema`: the value is interpolated into a
 * path, so "it is typed `number`" is not a check.
 */
const vikunjaIdSchema = z.number().int().positive()

/**
 * A task's two free-text fields on the way *out*.
 *
 * The ceilings are the same ones the pull truncates to, so a round trip
 * cannot grow a task past what the widget is willing to read back. The title
 * is trimmed and must survive it: Vikunja accepts `"   "` and the user then
 * has a nameless task they cannot find.
 */
const vikunjaTaskTitleSchema = z
  .string()
  .max(VIKUNJA_MAX_TITLE_LENGTH)
  .transform((raw) => raw.trim())
  .refine((title) => title.length > 0)

const vikunjaDescriptionSchema = z.string().max(VIKUNJA_MAX_DESCRIPTION_LENGTH)

const vikunjaCreatePayloadSchema = z.object({
  title: vikunjaTaskTitleSchema,
  description: vikunjaDescriptionSchema.optional(),
})

/**
 * The patch of an `update`. Every field optional — the point of the op is to
 * send only what changed — but each one validated the same way as on create,
 * because the merge writes it into the task either way.
 */
const vikunjaUpdatePayloadSchema = z.object({
  title: vikunjaTaskTitleSchema.optional(),
  description: vikunjaDescriptionSchema.optional(),
  done: z.boolean().optional(),
})

/**
 * The etag the widget claims to have read the task at. Bounded and non-empty:
 * it is a normalised ISO timestamp (~24 chars), and an empty one would mean
 * "compare against nothing", which is exactly the case `updateTask`'s
 * conflict check exists to refuse.
 */
const vikunjaEtagSchema = z.string().min(1).max(64)

/**
 * Label ids for one `setLabels` call. Bounded at 50 per direction: each id
 * costs a request, and a renderer asking for ten thousand of them is asking
 * the worker to hammer the user's instance until MV3 unloads it.
 */
const vikunjaLabelIdsSchema = z.array(vikunjaIdSchema).max(50)

function toProjectSummary(project: VikunjaProject): VikunjaProjectSummary {
  // The first kanban view wins. A project can hold several, but they share
  // the same tasks — picking one deterministically beats asking the user to
  // choose between "Kanban" and "Kanban (copy)".
  const kanban = project.views.find((view) => view.view_kind === 'kanban')
  return {
    id: project.id,
    title: project.title,
    kanbanViewId: kanban?.id ?? null,
    isArchived: project.is_archived,
  }
}

/**
 * Both flags come from the view, not from the bucket: a bucket record says
 * nothing about the role the view gave it. `0` is Vikunja's "unset" sentinel
 * (recon Q5) and no bucket has id 0, so no special case is needed.
 */
function toBucketSummary(bucket: VikunjaBucket, view: VikunjaView): VikunjaBucketSummary {
  return {
    id: bucket.id,
    title: bucket.title,
    isDone: bucket.id === view.done_bucket_id,
    isDefault: bucket.id === view.default_bucket_id,
  }
}

function toLabelSummary(label: VikunjaLabel): VikunjaLabelSummary {
  // `hex_color` is `""` rather than null when the user never picked one.
  return { id: label.id, title: label.title, hexColor: label.hex_color || null }
}

/**
 * `bucketId` comes from the bucket the task was found in, not from
 * `task.bucket_id`: the latter is only correct inside a view response and is
 * `0` everywhere else (recon Q3), so trusting the field instead of the
 * position would silently unmap every task.
 *
 * `title` and `description` are truncated to the documented ceilings.
 */
function toPulledTask(task: VikunjaTask, bucketId: number): VikunjaPulledTask {
  return {
    id: task.id,
    identifier: task.identifier,
    // Bounded here, at the edge: everything downstream — the message clone,
    // the local store, `chrome.storage.local`'s shared quota — pays for
    // whatever a single task happens to carry.
    title: task.title.slice(0, VIKUNJA_MAX_TITLE_LENGTH),
    description: task.description.slice(0, VIKUNJA_MAX_DESCRIPTION_LENGTH),
    done: task.done,
    doneAt: task.done_at,
    bucketId,
    created: task.created,
    // Normalised here, at the single point every pulled task passes through,
    // so no consumer can forget and compare nanoseconds with seconds.
    updated: normalizeVikunjaTimestamp(task.updated),
    labelIds: task.labels.map((label) => label.id),
  }
}

/** Every project the token can see, trimmed to what the scope picker needs. */
export function handleListProjects(
  req: Extract<VikunjaRequest, { op: 'listProjects' }>,
): Promise<VikunjaResponse<VikunjaProjectSummary[]>> {
  return withVikunjaClient(req.cfg, async (client) => {
    const out = await client.getProjects()
    if (!out.ok) return out
    return { ok: true, value: out.value.map(toProjectSummary) }
  })
}

/**
 * The buckets of one view, each flagged with whether it is the view's done
 * bucket. Two requests: `GET /views/:id` carries `done_bucket_id`, the bucket
 * list does not repeat it.
 */
export function handleListBuckets(
  req: Extract<VikunjaRequest, { op: 'listBuckets' }>,
): Promise<VikunjaResponse<VikunjaBucketSummary[]>> {
  const scope = vikunjaScopeSchema.safeParse(req)
  if (!scope.success) return Promise.resolve(VIKUNJA_UNKNOWN_FAILURE)
  const { projectId, viewId } = scope.data

  return withVikunjaClient(req.cfg, async (client) => {
    const view = await client.getView(projectId, viewId)
    if (!view.ok) return view

    const buckets = await client.getBuckets(projectId, viewId)
    if (!buckets.ok) return buckets

    return {
      ok: true,
      value: buckets.value.map((bucket) => toBucketSummary(bucket, view.value)),
    }
  })
}

/** Labels are instance-wide, so this op carries no scope. */
export function handleListLabels(
  req: Extract<VikunjaRequest, { op: 'listLabels' }>,
): Promise<VikunjaResponse<VikunjaLabelSummary[]>> {
  return withVikunjaClient(req.cfg, async (client) => {
    const out = await client.getLabels()
    if (!out.ok) return out
    return { ok: true, value: out.value.map(toLabelSummary) }
  })
}

/** Creates one kanban column, for the wizard's "build the missing ones" step. */
export function handleCreateBucket(
  req: Extract<VikunjaRequest, { op: 'createBucket' }>,
): Promise<VikunjaResponse<VikunjaBucketSummary>> {
  const scope = vikunjaScopeSchema.safeParse(req)
  const title = vikunjaBucketTitleSchema.safeParse(req.title)
  if (!scope.success || !title.success) return Promise.resolve(VIKUNJA_UNKNOWN_FAILURE)
  const { projectId, viewId } = scope.data

  return withVikunjaClient(req.cfg, async (client) => {
    const out = await client.createBucket(projectId, viewId, title.data)
    if (!out.ok) return out
    // A freshly created bucket is neither the done nor the default bucket:
    // the view's ids still point at whatever they pointed at before.
    return {
      ok: true,
      value: { id: out.value.id, title: out.value.title, isDone: false, isDefault: false },
    }
  })
}

/**
 * The full pull: every bucket of the view with every task in it, flattened
 * into one list. Done tasks come along for free (recon Q6) — the done bucket
 * is just another bucket in the response.
 */
export function handlePull(
  req: Extract<VikunjaRequest, { op: 'pull' }>,
): Promise<VikunjaResponse<VikunjaPullResult>> {
  const scope = vikunjaScopeSchema.safeParse(req)
  if (!scope.success) return Promise.resolve(VIKUNJA_UNKNOWN_FAILURE)
  const { projectId, viewId } = scope.data

  return withVikunjaClient(req.cfg, async (client) => {
    const out = await client.getViewTasks(projectId, viewId)
    if (!out.ok) return out

    const tasks = out.value.flatMap((bucket) =>
      (bucket.tasks ?? []).map((task) => toPulledTask(task, bucket.id)),
    )
    return { ok: true, value: { tasks, pulledAt: Date.now() } }
  })
}

/**
 * What a mutation reports back.
 *
 * `bucket_id` on a task is only filled inside a view response (recon Q3), so
 * a create or an edit answers `0` and the caller's own `fallback` — the bucket
 * a move was asked for, or nothing — stands in. Never a guess: `0` travels to
 * the widget as `0`, and the widget keeps its last known bucket rather than
 * believing it.
 */
function toTaskWrite(task: VikunjaTask, fallbackBucketId = 0): VikunjaTaskWrite {
  return {
    id: task.id,
    identifier: task.identifier,
    bucketId: task.bucket_id > 0 ? task.bucket_id : fallbackBucketId,
    done: task.done,
    doneAt: task.done_at,
    // Normalised at the single point every mutation answer passes through:
    // this value becomes the widget's etag, and a nanosecond timestamp stored
    // there would conflict against the next read (recon Q16).
    updated: normalizeVikunjaTimestamp(task.updated),
  }
}

/** Creates a task in the project's default bucket. */
export function handleCreate(
  req: Extract<VikunjaRequest, { op: 'create' }>,
): Promise<VikunjaResponse<VikunjaTaskWrite>> {
  const projectId = vikunjaIdSchema.safeParse(req.projectId)
  const payload = vikunjaCreatePayloadSchema.safeParse(req.payload)
  if (!projectId.success || !payload.success) return Promise.resolve(VIKUNJA_UNKNOWN_FAILURE)

  return withVikunjaClient(req.cfg, async (client) => {
    const out = await client.createTask(projectId.data, payload.data)
    if (!out.ok) return out
    return { ok: true, value: toTaskWrite(out.value) }
  })
}

/**
 * Edits a task through the read-modify-write in `VikunjaClient.updateTask` —
 * the only path in the project that may `POST /tasks/:id`. A stale `etag`
 * comes back as `conflict` and nothing is sent.
 */
export function handleUpdate(
  req: Extract<VikunjaRequest, { op: 'update' }>,
): Promise<VikunjaResponse<VikunjaTaskWrite>> {
  const taskId = vikunjaIdSchema.safeParse(req.taskId)
  const etag = vikunjaEtagSchema.safeParse(req.etag)
  const payload = vikunjaUpdatePayloadSchema.safeParse(req.payload)
  if (!taskId.success || !etag.success || !payload.success) {
    return Promise.resolve(VIKUNJA_UNKNOWN_FAILURE)
  }

  return withVikunjaClient(req.cfg, async (client) => {
    const out = await client.updateTask(taskId.data, payload.data, etag.data)
    if (!out.ok) return out
    return { ok: true, value: toTaskWrite(out.value) }
  })
}

/**
 * Moves a task into a bucket. The response's embedded task is authoritative
 * for `done` / `done_at` — the done bucket flips them server-side (recon Q7)
 * — so no follow-up read is needed and none is made.
 */
export function handleMoveToBucket(
  req: Extract<VikunjaRequest, { op: 'moveToBucket' }>,
): Promise<VikunjaResponse<VikunjaTaskWrite>> {
  const scope = vikunjaScopeSchema.safeParse(req)
  const taskId = vikunjaIdSchema.safeParse(req.taskId)
  const bucketId = vikunjaIdSchema.safeParse(req.bucketId)
  if (!scope.success || !taskId.success || !bucketId.success) {
    return Promise.resolve(VIKUNJA_UNKNOWN_FAILURE)
  }
  const { projectId, viewId } = scope.data

  return withVikunjaClient(req.cfg, async (client) => {
    const out = await client.moveToBucket(projectId, viewId, bucketId.data, taskId.data)
    if (!out.ok) return out
    // The move endpoint knows the bucket even when the embedded task does not.
    return { ok: true, value: toTaskWrite(out.value.task, out.value.bucketId) }
  })
}

/** Deletes a task for good. No push produces this — see `client.deleteTask`. */
export function handleDelete(
  req: Extract<VikunjaRequest, { op: 'delete' }>,
): Promise<VikunjaResponse<VikunjaDeleteResult>> {
  const taskId = vikunjaIdSchema.safeParse(req.taskId)
  if (!taskId.success) return Promise.resolve(VIKUNJA_UNKNOWN_FAILURE)

  return withVikunjaClient(req.cfg, async (client) => {
    const out = await client.deleteTask(taskId.data)
    if (!out.ok) return out
    return { ok: true, value: { deleted: true } }
  })
}

/**
 * Attaches and detaches labels, one request each (Vikunja has no bulk form).
 *
 * Removals run before additions so a project change frees the slot before it
 * fills it, and both run sequentially: the label endpoints are per-id, and
 * firing them in parallel would only race the same task's own mutation queue.
 *
 * The read that opens it is not optional. A removal list is a list of **ids**,
 * and whether an id is one of the reserved `energy:` / `mood:` labels (recon
 * Q13) can only be told from its *title* — which lives on the task. So the
 * task is read first, the reserved ids are dropped from the removals, and a
 * renderer that asks for one is refused rather than trusted. Ids the task does
 * not carry are dropped too: Vikunja answers 404 for those, and one stale id
 * in the list would otherwise abort the whole operation.
 */
export function handleSetLabels(
  req: Extract<VikunjaRequest, { op: 'setLabels' }>,
): Promise<VikunjaResponse<VikunjaSetLabelsResult>> {
  const taskId = vikunjaIdSchema.safeParse(req.taskId)
  const add = vikunjaLabelIdsSchema.safeParse(req.add)
  const remove = vikunjaLabelIdsSchema.safeParse(req.remove)
  if (!taskId.success || !add.success || !remove.success) {
    return Promise.resolve(VIKUNJA_UNKNOWN_FAILURE)
  }

  return withVikunjaClient(req.cfg, async (client) => {
    const current = await client.getTaskRaw(taskId.data)
    if (!current.ok) return current

    const attached = new Set(current.value.task.labels.map((label) => label.id))
    const reserved = new Set(
      current.value.task.labels
        .filter((label) => isReservedVikunjaLabel(label.title))
        .map((label) => label.id),
    )

    const removed: number[] = []
    for (const labelId of remove.data) {
      if (reserved.has(labelId) || !attached.has(labelId)) continue
      const out = await client.removeLabel(taskId.data, labelId)
      if (!out.ok) return out
      attached.delete(labelId)
      removed.push(labelId)
    }

    const added: number[] = []
    for (const labelId of add.data) {
      if (attached.has(labelId)) continue
      const out = await client.addLabel(taskId.data, labelId)
      if (!out.ok) return out
      attached.add(labelId)
      added.push(labelId)
    }

    return { ok: true, value: { added, removed } }
  })
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
 * Dispatcher. Every op of the union is wired up; `default` stays as the
 * refusal for an `op` that somehow passed `isVikunjaRequest` without having a
 * handler — it answers `unknown` rather than falling through to a throw.
 */
export async function handleVikunjaRequest(req: VikunjaRequest): Promise<VikunjaResponse<unknown>> {
  switch (req.op) {
    case 'ping': {
      const value: VikunjaPing = { pong: true, at: Date.now() }
      return { ok: true, value }
    }

    case 'connect':
      return handleConnect(req)

    case 'listProjects':
      return handleListProjects(req)

    case 'listBuckets':
      return handleListBuckets(req)

    case 'listLabels':
      return handleListLabels(req)

    case 'createBucket':
      return handleCreateBucket(req)

    case 'pull':
      return handlePull(req)

    case 'create':
      return handleCreate(req)

    case 'update':
      return handleUpdate(req)

    case 'moveToBucket':
      return handleMoveToBucket(req)

    case 'delete':
      return handleDelete(req)

    case 'setLabels':
      return handleSetLabels(req)

    default:
      return VIKUNJA_UNKNOWN_FAILURE
  }
}
