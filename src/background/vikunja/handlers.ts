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

import { vikunjaWireSchema, withVikunjaClient } from '@/background/vikunja/gate.ts'
import {
  isReservedVikunjaLabel,
  normalizeVikunjaTimestamp,
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
  VIKUNJA_UNKNOWN_FAILURE,
} from '@/background/vikunja/messages.ts'
import { runPull } from '@/background/vikunja/pull.ts'

import type {
  VikunjaBucketSummary,
  VikunjaConnectInfo,
  VikunjaDeleteResult,
  VikunjaLabelSummary,
  VikunjaPing,
  VikunjaProjectSummary,
  VikunjaPullResult,
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
 * Re-exported so the gate keeps its historical import path
 * (`@/background/vikunja/handlers.ts`) after moving to `gate.ts`, where the
 * background pull can reach it without an import cycle through this file.
 */
export { vikunjaWireSchema, withVikunjaClient }

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

/**
 * Exported so the sender side can be tested against the real contract:
 * `tests/unit/todo/vikunjaPush.test.ts` runs its clamped payloads through
 * these, rather than re-stating the ceilings and drifting from them.
 */
export const vikunjaCreatePayloadSchema = z.object({
  title: vikunjaTaskTitleSchema,
  description: vikunjaDescriptionSchema.optional(),
})

/**
 * The patch of an `update`. Every field optional — the point of the op is to
 * send only what changed — but each one validated the same way as on create,
 * because the merge writes it into the task either way.
 */
export const vikunjaUpdatePayloadSchema = z
  .object({
    title: vikunjaTaskTitleSchema.optional(),
    description: vikunjaDescriptionSchema.optional(),
    done: z.boolean().optional(),
  })
  // An empty patch would spend a read-modify-write on writing the record back
  // exactly as it was — and bump `updated`, invalidating every other client's
  // etag for nothing. A caller with no fields to send should not be calling.
  .refine((patch) => Object.keys(patch).length > 0)

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
 *
 * The work itself lives in `pull.ts`, because `chrome.alarms` runs the very
 * same read in the background with no message involved. All this handler adds
 * is what a bridge op must add: it does not trust the renderer's ids, and it
 * reads `force` as a boolean rather than as whatever was sent — an unforced
 * pull may be answered from the worker's snapshot, which is the whole point
 * of the broadcast-triggered sync.
 */
export async function handlePull(
  req: Extract<VikunjaRequest, { op: 'pull' }>,
): Promise<VikunjaResponse<VikunjaPullResult>> {
  const scope = vikunjaScopeSchema.safeParse(req)
  if (!scope.success) return VIKUNJA_UNKNOWN_FAILURE
  const { projectId, viewId } = scope.data

  const out = await runPull(req.cfg, projectId, viewId, { force: req.force === true })
  if (!out.ok) return out

  // The delta and the snapshot's fate stay in the worker: the widget
  // reconciles the whole list, and shipping what it does not read across a
  // `structuredClone` boundary would only be more for it to validate.
  return { ok: true, value: { tasks: out.value.tasks, pulledAt: out.value.pulledAt } }
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
 *
 * Only `remove` is screened. Attaching a reserved label is not destructive —
 * it is a label the user already has, on a task they chose — and the widget
 * never offers one as a project anyway, so there is nothing to protect there.
 *
 * Partial application is intentional. There is no transaction to be had:
 * Vikunja has one endpoint per label, so a failure half-way leaves the changes
 * made so far in place and the result reports exactly those. That is safe to
 * retry — the same call runs again, the labels already applied are skipped as
 * "already attached" / "not attached", and the outcome is the same as if it
 * had succeeded the first time.
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
