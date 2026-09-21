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
  normalizeVikunjaTimestamp,
  vikunjaHostPattern,
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
  VIKUNJA_UNKNOWN_FAILURE,
} from '@/background/vikunja/messages.ts'

import type {
  VikunjaBucketSummary,
  VikunjaConnectInfo,
  VikunjaLabelSummary,
  VikunjaPing,
  VikunjaProjectSummary,
  VikunjaPullResult,
  VikunjaPulledTask,
  VikunjaRequest,
  VikunjaResponse,
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
 * Dispatcher. Everything the read path needs is wired up; the write ops
 * (`create` / `update` / `moveToBucket` / `delete` / `setLabels`) answer
 * `unknown` until task 6 implements them, rather than pretending to work.
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

    default:
      return VIKUNJA_UNKNOWN_FAILURE
  }
}
