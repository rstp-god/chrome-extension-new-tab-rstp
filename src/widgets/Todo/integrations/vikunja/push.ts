/**
 * The write half of the Vikunja adapter: what a local mutation turns into on
 * the wire.
 *
 * Split out of `index.ts` because it is the part with the rules in it. Vikunja
 * has no single "save this task" call — a push is one or two ops chosen by the
 * kind of change and by whether the user mapped the board's buckets at all:
 *
 * - `create` is `create` (+ a move or a `done` flag to put the task where its
 *   status says it belongs). The task's project needs no op of its own: it is
 *   the board it was created in;
 * - `update` is one full read-modify-write of the title and description, and
 *   never carries `done` — that is a status change, and it has its own path;
 * - `status` is a bucket move in kanban mode, and in flat mode either a `done`
 *   flag or nothing at all;
 * - `project` is refused: the project *is* the board, so a move would mean
 *   creating a different task elsewhere;
 * - `delete` is a move into the trash column, or nothing. Vikunja's own
 *   `DELETE /tasks/:id` is deliberately unreachable from here: the widget's
 *   "delete" is a status, and destroying someone's task because they pressed a
 *   bin icon in a new-tab page is not a trade we make;
 * - `resync` — the retry a sync uses when it no longer knows what changed —
 *   re-asserts the bucket, and deliberately never the title or the
 *   description.
 *
 * Everything here goes through the bridge — the worker owns the HTTP, the
 * read-modify-write and the etag check (see `VikunjaClient.updateTask`).
 */

import { primaryContainerIdForStatus } from '@/widgets/Todo/integrations/statusMapping.ts'
import { isVikunjaRef } from '@/widgets/Todo/integrations/types.ts'

import { clampForVikunja } from './mapping.ts'
import { vikunjaTaskWriteSchema } from './schema.ts'

import type {
  VikunjaRequest,
  VikunjaTaskWrite,
  VikunjaWire,
} from '@/background/vikunja/messages.ts'
import type {
  IntegrationOutcome,
  IntegrationPushOp,
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
  /**
   * The bucket mapping of the board being written to, or `null` when it has
   * none.
   *
   * Comes from the board rather than from the store's push context: with
   * several boards connected, each has its own columns and its own mapping
   * over them, so a mapping the store passed could only ever be one of them.
   * `null` is flat mode, where no bucket is addressed at all — and a kanban
   * board without a mapping simply names no destination, which is what
   * `bucketIdForStatus` answers.
   */
  mapping: StatusListMapping | null
  send: <S extends z.ZodType>(
    request: VikunjaRequest,
    schema: S,
  ) => Promise<IntegrationOutcome<z.infer<S>>>
}

export interface VikunjaPushInput {
  task: TodoTask
  op: IntegrationPushOp
  scope: VikunjaScope
}

/** A mapping row that names no usable bucket cannot address a destination. */
const NO_DESTINATION: IntegrationOutcome<never> = { ok: false, errorKey: 'mappingIncomplete' }

/**
 * Carries a ref that an earlier write already established through a later
 * failure (see `IntegrationOutcome.ref`).
 *
 * Creating a task is up to three requests. If the second one fails, the task
 * exists: an outcome that reported only the error would leave the store with
 * no ref, and the next sync would create the task all over again. The most
 * recent ref wins — a move rewrites `updated`, and remembering the pre-move
 * etag would cost the user a spurious conflict on their next edit.
 */
function keepingRef<T>(out: IntegrationOutcome<T>, ref: VikunjaRemoteRef): IntegrationOutcome<T> {
  if (out.ok) return out
  return { ok: false, errorKey: out.errorKey, ref: out.ref ?? ref }
}

/**
 * The bucket a task enters when it takes on `status`, or `null` when the
 * mapping does not name one this backend can address.
 *
 * A Vikunja bucket id is a positive integer; the mapping stores container ids
 * as strings because Trello's are strings, so the conversion is where a
 * hand-edited or half-finished mapping is caught — before an id like `NaN`
 * ends up in a request path.
 */
export function bucketIdForStatus(
  status: TodoStatus,
  mapping: StatusListMapping | null,
): number | null {
  // A board whose wizard was never finished names no bucket for any status.
  if (mapping === null) return null
  // Declared `string` by the contract, but a persisted mapping can carry an
  // empty row, and `[0]` of an empty array is `undefined` whatever the type says.
  const raw: string | undefined = primaryContainerIdForStatus(status, mapping)
  if (raw === undefined) return null
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * The ref to store after a mutation.
 *
 * `projectId` is the board the write happened on, passed in rather than read
 * off the response: a task write answers with the task, and the board is
 * something only the caller's scope (or the ref it already had) knows.
 *
 * `bucketId` falls back to the previous one when the answer reports `0`: only
 * a view response fills a task's `bucket_id` (recon Q3), so an edit or a
 * create genuinely does not know where the task sits, and forgetting the last
 * known bucket would be worse than remembering it a moment longer.
 */
export function refFromWrite(
  write: VikunjaTaskWrite,
  projectId: number,
  previous: VikunjaRemoteRef | null = null,
): VikunjaRemoteRef {
  return {
    taskId: write.id,
    projectId,
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
      return applyProject()
    case 'resync':
      return resync(deps, input, ref)
  }
}

/**
 * Creates the task, then puts it where it belongs.
 *
 * Two ops at most: the task has to exist before a move can place it. The
 * task's *project* costs no request at all — it is the board the task was
 * created in, which the create above already decided (`scope.projectId`).
 *
 * Two rules keep a failure half-way through from costing the user a duplicate:
 *
 * - the destination bucket is resolved **before** the create, so a mapping
 *   that names no bucket is refused while nothing has happened yet. Deciding
 *   that afterwards would leave a real task behind an outcome that says the
 *   push never started;
 * - every failure after the create carries the ref of what was created (see
 *   `keepingRef`), so the store can remember the task exists even though it is
 *   not fully placed.
 */
async function createTask(
  deps: VikunjaPushDeps,
  { task, scope }: VikunjaPushInput,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  const bucketId = deps.flat ? null : bucketIdForStatus(task.status, deps.mapping)
  if (!deps.flat && bucketId === null) return NO_DESTINATION

  const created = await deps.send(
    {
      type: 'vikunja',
      op: 'create',
      cfg: deps.cfg,
      projectId: scope.projectId,
      payload: clampForVikunja(task.title, task.description ?? ''),
    },
    vikunjaTaskWriteSchema,
  )
  if (!created.ok) return created
  const ref = refFromWrite(created.value, scope.projectId)

  // Vikunja drops a new task into the view's default bucket, and the create
  // response cannot say which one that was (`bucket_id` is only filled inside
  // a view response — recon Q3), so kanban mode always moves.
  if (bucketId !== null) {
    return keepingRef(await move(deps, scope, created.value.id, bucketId, ref), ref)
  }

  // Flat mode has one remote bit to set, and only when it is set: a new task
  // that is already completed. Everything else stays local.
  if (task.status === 'completed') {
    return keepingRef(await setDone(deps, created.value.id, ref.updated, true, ref), ref)
  }

  return { ok: true, value: ref }
}

/**
 * "Make the remote match this task again" — the retry a sync uses when the
 * store no longer knows which edit failed.
 *
 * Deliberately **not** title and description. The widget has no editing UI for
 * either, so its copy is only ever what a pull gave it, flattened to plain
 * text; pushing that back on a retry would overwrite whatever the user has
 * since written in Vikunja's own editor and strip its formatting. What the
 * widget genuinely owns is where the task sits, so that is what gets
 * re-asserted — the project is the board the task lives on and cannot drift
 * from under it.
 *
 * The move is skipped when the ref already names the destination. A ref that
 * never learned its bucket (`null`, or a `0` from a create) does not count as
 * naming it — those move, because the alternative is trusting a value we know
 * we never read.
 */
async function resync(
  deps: VikunjaPushDeps,
  { task, scope }: VikunjaPushInput,
  ref: VikunjaRemoteRef,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  // Flat mode: `done` is the only field that crosses at all, and the local
  // status is the authority on it during a retry of a local change.
  if (deps.flat) {
    return setDone(deps, ref.taskId, ref.updated, task.status === 'completed', ref)
  }

  const bucketId = bucketIdForStatus(task.status, deps.mapping)
  if (bucketId === null) return NO_DESTINATION

  if (ref.bucketId === bucketId) return { ok: true, value: ref }
  return move(deps, scope, ref.taskId, bucketId, ref)
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
      payload: clampForVikunja(task.title, task.description ?? ''),
    },
    vikunjaTaskWriteSchema,
  )
  if (!out.ok) return out
  return { ok: true, value: refFromWrite(out.value, ref.projectId, ref) }
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
  { task, scope }: VikunjaPushInput,
  ref: VikunjaRemoteRef,
  previous: TodoStatus | null,
): Promise<IntegrationOutcome<VikunjaRemoteRef>> {
  if (!deps.flat) {
    const bucketId = bucketIdForStatus(task.status, deps.mapping)
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
 * A project change, which this backend has no way to perform.
 *
 * A Vikunja task's project is the board it was created in: moving it means
 * creating a different task somewhere else, with a new id and a new ref —
 * nothing this op could honestly do to the record it was handed. The
 * descriptor says as much through `projectPolicy.changeable: false`, and the
 * store refuses such a move before it ever reaches an adapter, so this is
 * the belt to that braces: a hand-edited record (or a future caller that
 * forgets the policy) is told the push failed rather than being answered with
 * a success that changed nothing.
 *
 * It used to swap a *label*, which was the closest thing Vikunja had to
 * Trello's per-board tags. That stopped being the task's project the moment
 * `projectId` became the board's id — a label op would have written one id
 * space into another.
 */
function applyProject(): IntegrationOutcome<VikunjaRemoteRef> {
  return { ok: false, errorKey: 'pushFailed' }
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
  return { ok: true, value: refFromWrite(out.value, scope.projectId, previous) }
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
  return { ok: true, value: refFromWrite(out.value, previous.projectId, previous) }
}
