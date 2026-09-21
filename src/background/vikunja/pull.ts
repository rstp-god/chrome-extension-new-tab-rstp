/**
 * The one read path of the integration, shared by the bridge op `pull` and by
 * the background alarm.
 *
 * Two rules it exists to hold in one place:
 *
 * 1. **A pull is always full and always through the view endpoint.** An
 *    incremental read filtered by `updated` is cheaper and wrong twice over:
 *    it cannot report a deletion at all, and outside a view response Vikunja
 *    answers `bucket_id = 0` (recon Q3 / §2.2), which would unmap every task
 *    it returned. So the delta is computed by comparing two full reads
 *    instead.
 * 2. **A non-forced pull may be answered from the snapshot.** The alarm reads
 *    the view once and broadcasts; every open New Tab page then syncs, and
 *    those syncs land here within milliseconds of each other. Serving them
 *    from the snapshot is the difference between one request and one request
 *    per tab against someone's own server.
 */

import { z } from 'zod'

import { readSnapshot, writeSnapshot } from '@/background/vikunja/cache.ts'
import { VIKUNJA_SNAPSHOT_FRESH_MS } from '@/background/vikunja/constants.ts'
import { withVikunjaClient } from '@/background/vikunja/gate.ts'
import {
  normalizeVikunjaTimestamp,
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
  VIKUNJA_UNKNOWN_FAILURE,
} from '@/background/vikunja/messages.ts'

import type { VikunjaSnapshot } from '@/background/vikunja/cache.ts'
import type {
  VikunjaPullDelta,
  VikunjaPullResult,
  VikunjaPulledTask,
  VikunjaResponse,
} from '@/background/vikunja/messages.ts'
import type { VikunjaTask } from '@/background/vikunja/schema.ts'

/**
 * Nothing observed to change — the answer for a cache hit. A factory rather
 * than a shared constant: the value travels to a caller that may keep it, and
 * three arrays cost nothing.
 */
function emptyDelta(): VikunjaPullDelta {
  return { added: [], changed: [], removed: [] }
}

/**
 * Ids as they arrive from a caller. The alarm's storage schema and the
 * bridge's op schema both check them already; this is the last line before
 * they are interpolated into a request path, and it costs nothing.
 */
const scopeSchema = z.object({
  projectId: z.number().int().positive(),
  viewId: z.number().int().positive(),
})

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
    // the snapshot, the local store, `chrome.storage.local`'s shared quota —
    // pays for whatever a single task happens to carry.
    title: task.title.slice(0, VIKUNJA_MAX_TITLE_LENGTH),
    description: task.description.slice(0, VIKUNJA_MAX_DESCRIPTION_LENGTH),
    done: task.done,
    doneAt: task.done_at,
    bucketId,
    // Normalised here, at the single point every pulled task passes through,
    // so no consumer can forget and compare nanoseconds with seconds.
    updated: normalizeVikunjaTimestamp(task.updated),
    created: task.created,
    labelIds: task.labels.map((label) => label.id),
  }
}

/**
 * What moved between two full reads of the same view.
 *
 * Pure, and the only place the meaning of "changed" is decided:
 *
 * - `updated` — every edit Vikunja itself records. Both sides are already
 *   normalised to whole seconds (recon Q16), so a mutation's nanosecond
 *   timestamp cannot masquerade as a change;
 * - `bucketId` — a move between columns, which is the widget's *status* and
 *   is not always reflected in `updated`: Vikunja records a bucket change on
 *   the view, not on the task;
 * - `done` — the one field the done bucket flips server-side (recon Q7).
 *
 * `previous === null` (no snapshot: first pull, or a corrupt record) reports
 * every task as `added`. That is the honest answer — the worker genuinely
 * does not know what the view looked like before — and it makes the first
 * background pull of a session broadcast, which is what gets a page that was
 * opened while the browser was offline back in sync.
 */
export function computeDelta(
  previous: VikunjaPulledTask[] | null,
  current: VikunjaPulledTask[],
): VikunjaPullDelta {
  if (previous === null) {
    return { added: current.map((task) => task.id), changed: [], removed: [] }
  }

  const before = new Map(previous.map((task) => [task.id, task]))

  const added: number[] = []
  const changed: number[] = []
  for (const task of current) {
    const known = before.get(task.id)
    if (!known) {
      added.push(task.id)
      continue
    }
    if (
      known.updated !== task.updated ||
      known.bucketId !== task.bucketId ||
      known.done !== task.done
    ) {
      changed.push(task.id)
    }
  }

  // A full read of the view lists every task in it, so an id that was there
  // and is not any more was deleted (or moved out) remotely — the one thing
  // an incremental pull could never tell us.
  const present = new Set(current.map((task) => task.id))
  const removed = previous.filter((task) => !present.has(task.id)).map((task) => task.id)

  return { added, changed, removed }
}

/** Does this delta say anything at all? */
export function isEmptyDelta(delta: VikunjaPullDelta): boolean {
  return delta.added.length === 0 && delta.changed.length === 0 && delta.removed.length === 0
}

/**
 * Is the snapshot recent enough to answer a non-forced pull?
 *
 * A negative age (a snapshot stamped in the future, which a clock change or a
 * hand-edited record can produce) counts as stale: believing it would pin the
 * widget to a cached list for as long as the clock is wrong.
 */
function isFresh(snapshot: VikunjaSnapshot, now: number): boolean {
  const age = now - snapshot.pulledAt
  return age >= 0 && age < VIKUNJA_SNAPSHOT_FRESH_MS
}

/**
 * Reads the configured view and reports it together with what changed since
 * the previous read.
 *
 * `force: false` (the default) is allowed to answer from the snapshot, which
 * costs no network and no credentials — deliberately before the gate, because
 * there is nothing to gate: nothing is sent, and the snapshot lives in the
 * very `chrome.storage.local` the calling page can read on its own. Every
 * path that *does* touch the network goes through `withVikunjaClient`.
 */
export async function runPull(
  cfg: unknown,
  projectId: number,
  viewId: number,
  opts: { force?: boolean } = {},
): Promise<VikunjaResponse<VikunjaPullResult>> {
  const scope = scopeSchema.safeParse({ projectId, viewId })
  if (!scope.success) return VIKUNJA_UNKNOWN_FAILURE

  const previous = await readSnapshot(scope.data.projectId, scope.data.viewId)

  if (!opts.force && previous && isFresh(previous, Date.now())) {
    return {
      ok: true,
      value: { tasks: previous.tasks, pulledAt: previous.pulledAt, delta: emptyDelta() },
    }
  }

  return withVikunjaClient<VikunjaPullResult>(cfg, async (client) => {
    const out = await client.getViewTasks(scope.data.projectId, scope.data.viewId)
    if (!out.ok) return out

    const tasks = out.value.flatMap((bucket) =>
      (bucket.tasks ?? []).map((task) => toPulledTask(task, bucket.id)),
    )
    const delta = computeDelta(previous?.tasks ?? null, tasks)
    const pulledAt = Date.now()

    // Best effort: a snapshot that could not be written costs the next pull a
    // network read and an `added`-only delta, which is not a reason to fail a
    // read that succeeded.
    await writeSnapshot({
      projectId: scope.data.projectId,
      viewId: scope.data.viewId,
      tasks,
      pulledAt,
    })

    return { ok: true, value: { tasks, pulledAt, delta } }
  })
}
