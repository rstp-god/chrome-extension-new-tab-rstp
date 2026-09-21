/**
 * The write half of the Vikunja adapter: what a local mutation turns into on
 * the wire.
 *
 * Split out of `index.ts` because it is the part with the rules in it. Vikunja
 * has no single "save this task" call — a push is one to three ops chosen by
 * the kind of change and by whether the user mapped the board's buckets at
 * all:
 *
 * - `create` is `create` (+ `setLabels` for the project, + a move or a `done`
 *   flag to put the task where its status says it belongs);
 * - `update` is one full read-modify-write of the title and description, and
 *   never carries `done` — that is a status change, and it has its own path;
 * - `status` is a bucket move in kanban mode, and in flat mode either a `done`
 *   flag or nothing at all;
 * - `project` is label bookkeeping, which is not part of the task body;
 * - `delete` is a move into the trash column, or nothing. Vikunja's own
 *   `DELETE /tasks/:id` is deliberately unreachable from here: the widget's
 *   "delete" is a status, and destroying someone's task because they pressed a
 *   bin icon in a new-tab page is not a trade we make.
 *
 * Everything here goes through the bridge — the worker owns the HTTP, the
 * read-modify-write and the etag check (see `VikunjaClient.updateTask`).
 */

import { primaryContainerIdForStatus } from '@/widgets/Todo/integrations/statusMapping.ts'
import { isVikunjaRef } from '@/widgets/Todo/integrations/types.ts'

import { textToHtml } from './mapping.ts'
import { vikunjaSetLabelsResultSchema, vikunjaTaskWriteSchema } from './schema.ts'

import type {
  VikunjaRequest,
  VikunjaTaskWrite,
  VikunjaWire,
} from '@/background/vikunja/messages.ts'
import type {
  IntegrationOutcome,
  IntegrationPushOp,
  PushContext,
  StatusListMapping,
  TodoStatus,
  VikunjaRemoteRef,
} from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'
import type { z } from 'zod'

/** The project/view pair, already parsed out of the opaque `RemoteScope`. */
export interface VikunjaScope {
  projectId: number
  viewId: number
}

/**
 * What the push needs from the adapter: the credentials, which mode the user
 * chose, and the adapter's own validating `send`. Handed over rather than
 * imported so this module never has to know there is a class.
 */
export interface VikunjaPushDeps {
  cfg: VikunjaWire
  /** `true` when the user skipped the bucket mapping — see `flatModeMapping`. */
  flat: boolean
  send: <S extends z.ZodType>(
    request: VikunjaRequest,
    schema: S,
  ) => Promise<IntegrationOutcome<z.infer<S>>>
}

export interface VikunjaPushInput {
  task: TodoTask
  op: IntegrationPushOp
  ctx: PushContext
  scope: VikunjaScope
}

/** A mapping row that names no usable bucket cannot address a destination. */
const NO_DESTINATION: IntegrationOutcome<never> = { ok: false, errorKey: 'mappingIncomplete' }

/**
 * The bucket a task enters when it takes on `status`, or `null` when the
 * mapping does not name one this backend can address.
 *
 * A Vikunja bucket id is a positive integer; the mapping stores container ids
 * as strings because Trello's are strings, so the conversion is where a
 * hand-edited or half-finished mapping is caught — before an id like `NaN`
 * ends up in a request path.
 */
export function bucketIdForStatus(status: TodoStatus, mapping: StatusListMapping): number | null {
  // Declared `string` by the contract, but a persisted mapping can carry an
  // empty row, and `[0]` of an empty array is `undefined` whatever the type says.
  const raw: string | undefined = primaryContainerIdForStatus(status, mapping)
  if (raw === undefined) return null
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * A project id as a Vikunja label id. The widget's `Project.id` is the label
 * id stringified (`labelToProject`), so anything that does not survive the
 * round trip is not a label of ours and is dropped rather than sent.
 */
export function labelIdOf(projectId: string | null): number | null {
  if (projectId === null) return null
  const parsed = Number(projectId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * The ref to store after a mutation.
 *
 * `bucketId` falls back to the previous one when the answer reports `0`: only
 * a view response fills a task's `bucket_id` (recon Q3), so an edit or a
 * create genuinely does not know where the task sits, and forgetting the last
 * known bucket would be worse than remembering it a moment longer.
 */
export function refFromWrite(
  write: VikunjaTaskWrite,
  previous: VikunjaRemoteRef | null = null,
): VikunjaRemoteRef {
  return {
    taskId: write.id,
    identifier: write.identifier,
    bucketId: write.bucketId > 0 ? write.bucketId : (previous?.bucketId ?? null),
    updated: write.updated,
  }
}

export async function pushVikunjaTask(
  deps: VikunjaPushDeps,
  input: VikunjaPushInput,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  const { task, op } = input
  // A foreign ref (left over from another backend in a hand-edited record)
  // addresses no Vikunja task — re-link by creating one instead of failing
  // every push of that task forever.
  const ref = task.remoteRef && isVikunjaRef(task.remoteRef) ? task.remoteRef : null
  if (op.kind === 'create' || ref === null) return createTask(deps, input)

  switch (op.kind) {
    case 'update':
      return editFields(deps, input, ref)
    case 'status':
      return applyStatus(deps, input, ref, op.previous)
    case 'delete':
      return applyStatus(deps, input, ref, null)
    case 'project':
      return applyProject(deps, input, ref, op.previous)
  }
}

/**
 * Creates the task, then puts it where it belongs.
 *
 * Three ops at most, in this order: the task has to exist before a label can
 * be attached to it, and it has to carry its label before a move makes the
 * board look right. A failure at any step is reported as-is — the ref of a
 * half-placed task is not returned, because a caller that stored it would
 * believe the placement happened.
 */
async function createTask(
  deps: VikunjaPushDeps,
  { task, ctx, scope }: VikunjaPushInput,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  const created = await deps.send(
    {
      type: 'vikunja',
      op: 'create',
      cfg: deps.cfg,
      projectId: scope.projectId,
      payload: { title: task.title, description: textToHtml(task.description ?? '') },
    },
    vikunjaTaskWriteSchema,
  )
  if (!created.ok) return created

  const labelId = labelIdOf(task.projectId)
  if (labelId !== null) {
    const labelled = await deps.send(
      {
        type: 'vikunja',
        op: 'setLabels',
        cfg: deps.cfg,
        taskId: created.value.id,
        add: [labelId],
        remove: [],
      },
      vikunjaSetLabelsResultSchema,
    )
    if (!labelled.ok) return labelled
  }

  // Vikunja drops a new task into the view's default bucket, which is the
  // right place for an `input` task and the wrong one for every other status.
  if (!deps.flat) {
    const bucketId = bucketIdForStatus(task.status, ctx.mapping)
    if (bucketId === null) return NO_DESTINATION
    if (bucketId === created.value.bucketId) return { ok: true, value: refFromWrite(created.value) }
    return move(deps, scope, created.value.id, bucketId, refFromWrite(created.value))
  }

  // Flat mode has one remote bit to set, and only when it is set: a new task
  // that is already completed. Everything else stays local.
  if (task.status === 'completed') {
    return setDone(deps, created.value.id, created.value.updated, true, refFromWrite(created.value))
  }

  return { ok: true, value: refFromWrite(created.value) }
}

/**
 * A title/description edit: one `update`, carrying exactly those two fields.
 *
 * Never `done`. The worker merges this patch into the whole task, and sending
 * `done` from here would let a stale local flag move the task between buckets
 * behind the user's back (recon Q8) on what they meant as a rename.
 */
async function editFields(
  deps: VikunjaPushDeps,
  { task }: VikunjaPushInput,
  ref: VikunjaRemoteRef,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  const out = await deps.send(
    {
      type: 'vikunja',
      op: 'update',
      cfg: deps.cfg,
      taskId: ref.taskId,
      etag: ref.updated,
      payload: { title: task.title, description: textToHtml(task.description ?? '') },
    },
    vikunjaTaskWriteSchema,
  )
  if (!out.ok) return out
  return { ok: true, value: refFromWrite(out.value, ref) }
}

/**
 * A status change (including `delete`, which is the `deleted` status).
 *
 * Kanban mode: one move, and one only. Moving into the view's done bucket
 * sets `done` + `done_at` server-side and moving out resets them (recon Q7),
 * so a follow-up `done` update would be a second request for something that
 * already happened — and a second chance to get it wrong.
 *
 * Flat mode: there are no buckets to move between, so only the completed flag
 * crosses. `previous` is what tells "un-completed" apart from a transition
 * between two statuses Vikunja cannot see, which is a local-only move and
 * costs no request at all.
 */
async function applyStatus(
  deps: VikunjaPushDeps,
  { task, scope, ctx }: VikunjaPushInput,
  ref: VikunjaRemoteRef,
  previous: TodoStatus | null,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  if (!deps.flat) {
    const bucketId = bucketIdForStatus(task.status, ctx.mapping)
    if (bucketId === null) return NO_DESTINATION
    return move(deps, scope, ref.taskId, bucketId, ref)
  }

  if (task.status === 'completed') return setDone(deps, ref.taskId, ref.updated, true, ref)
  if (previous === 'completed') return setDone(deps, ref.taskId, ref.updated, false, ref)

  // `input` ↔ `inprogress` ↔ `struggle` ↔ `deleted` in flat mode: the deal the
  // user accepted when they skipped the bucket mapping is that these live in
  // the widget's own store.
  return { ok: true, value: ref }
}

/**
 * A project change, which in Vikunja is a label swap.
 *
 * Labels have their own endpoints and are not part of the task body, so this
 * never touches `updated` as far as we can observe — the ref is returned
 * unchanged rather than guessing a new etag. A wrong etag would cost the
 * user's *next* edit a spurious conflict; a slightly old one costs nothing,
 * because the worker re-reads before every write anyway.
 */
async function applyProject(
  deps: VikunjaPushDeps,
  { task }: VikunjaPushInput,
  ref: VikunjaRemoteRef,
  previous: string | null,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  const next = labelIdOf(task.projectId)
  const gone = labelIdOf(previous)

  // The same label on both sides means nothing changed — a request that adds
  // and removes one id would just flap it.
  const add = next !== null && next !== gone ? [next] : []
  const remove = gone !== null && gone !== next ? [gone] : []
  if (add.length === 0 && remove.length === 0) return { ok: true, value: ref }

  const out = await deps.send(
    { type: 'vikunja', op: 'setLabels', cfg: deps.cfg, taskId: ref.taskId, add, remove },
    vikunjaSetLabelsResultSchema,
  )
  if (!out.ok) return out
  return { ok: true, value: ref }
}

async function move(
  deps: VikunjaPushDeps,
  scope: VikunjaScope,
  taskId: number,
  bucketId: number,
  previous: VikunjaRemoteRef,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  const out = await deps.send(
    {
      type: 'vikunja',
      op: 'moveToBucket',
      cfg: deps.cfg,
      taskId,
      projectId: scope.projectId,
      viewId: scope.viewId,
      bucketId,
    },
    vikunjaTaskWriteSchema,
  )
  if (!out.ok) return out
  return { ok: true, value: refFromWrite(out.value, previous) }
}

async function setDone(
  deps: VikunjaPushDeps,
  taskId: number,
  etag: string,
  done: boolean,
  previous: VikunjaRemoteRef,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  const out = await deps.send(
    { type: 'vikunja', op: 'update', cfg: deps.cfg, taskId, etag, payload: { done } },
    vikunjaTaskWriteSchema,
  )
  if (!out.ok) return out
  return { ok: true, value: refFromWrite(out.value, previous) }
}
