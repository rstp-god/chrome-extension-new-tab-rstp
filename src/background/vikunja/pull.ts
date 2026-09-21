/**
 * The one read path of the integration, shared by the bridge op `pull` and by
 * the background alarm.
 *
 * Four rules it exists to hold in one place:
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
 * 3. **Every real read broadcasts what it found**, not just the alarm's. A
 *    manual sync in one tab rewrites the snapshot, so the next alarm tick
 *    would see an empty delta and the *other* tabs would never learn about
 *    the change. Broadcasting from here — the single place a read happens —
 *    is what keeps them in step.
 * 4. **One read per view at a time.** An alarm tick landing next to a
 *    widget's forced pull is two reads of the same board for one answer; the
 *    second caller joins the first instead.
 */

import { z } from 'zod'

import { broadcastVikunja } from '@/background/vikunja/broadcast.ts'
import { readSnapshot, snapshotHost, writeSnapshot } from '@/background/vikunja/cache.ts'
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
  VikunjaDeltaCounts,
  VikunjaPulledTask,
  VikunjaResponse,
} from '@/background/vikunja/messages.ts'
import type { VikunjaTask } from '@/background/vikunja/schema.ts'

/**
 * What moved, as task ids.
 *
 * Worker-internal on purpose: the broadcast carries `VikunjaDeltaCounts`
 * instead, because no page has a use for the ids. They exist here so
 * `isEmptyDelta` can be exact and so a test can say *which* task the
 * comparison noticed.
 */
export interface VikunjaPullDelta {
  added: number[]
  changed: number[]
  removed: number[]
}

/**
 * What a read reports back inside the worker: the tasks, plus the two things
 * only this layer knows — what changed, and whether the snapshot that would
 * let the woken tabs read it cheaply actually landed.
 *
 * The bridge's `VikunjaPullResult` is the narrower half of this; `handlePull`
 * drops the rest rather than shipping it across a `structuredClone` boundary
 * for nobody.
 */
export interface VikunjaPullOutcome {
  tasks: VikunjaPulledTask[]
  pulledAt: number
  delta: VikunjaPullDelta
  /** `false` when the snapshot could not be written (quota, storage gone). */
  persisted: boolean
}

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
    created: task.created,
    // Normalised here, at the single point every pulled task passes through,
    // so no consumer can forget and compare nanoseconds with seconds.
    updated: normalizeVikunjaTimestamp(task.updated),
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

/** The delta as it goes on the wire: how many, not which. */
function toDeltaCounts(delta: VikunjaPullDelta): VikunjaDeltaCounts {
  return {
    added: delta.added.length,
    changed: delta.changed.length,
    removed: delta.removed.length,
  }
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

export interface RunPullOptions {
  /** Read the view for real instead of answering from a fresh snapshot. */
  force?: boolean
  /**
   * Retry a 5xx on the client's backoff schedule. Default `true`, which is
   * what a bridge op wants: a page is waiting for the answer.
   *
   * The alarm passes `false`. It runs unattended every few minutes, so *it*
   * is the retry — and the 1/4/12 s waits would be spent sitting in an idle
   * worker that Chrome is entitled to unload mid-backoff.
   */
  retry?: boolean
}

/**
 * Reads the view once at a time, per view.
 *
 * Keyed by the pair rather than by "a pull is running": two configured
 * projects are two independent boards, and serialising them would make the
 * second one wait for no reason. The entry is dropped when the promise
 * settles, so a failure never wedges the view.
 */
const inFlight = new Map<string, Promise<VikunjaResponse<VikunjaPullOutcome>>>()

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
export function runPull(
  cfg: unknown,
  projectId: number,
  viewId: number,
  opts: RunPullOptions = {},
): Promise<VikunjaResponse<VikunjaPullOutcome>> {
  const scope = scopeSchema.safeParse({ projectId, viewId })
  if (!scope.success) return Promise.resolve(VIKUNJA_UNKNOWN_FAILURE)

  const key = `${scope.data.projectId}:${scope.data.viewId}`
  const running = inFlight.get(key)
  // A caller that would have read the very same view joins the read already
  // in flight. It can only get *fresher* data than it asked for, so even a
  // non-forced caller is happy with a forced read's answer.
  if (running) return running

  const started = pullView(cfg, scope.data.projectId, scope.data.viewId, opts).finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, started)
  return started
}

async function pullView(
  cfg: unknown,
  projectId: number,
  viewId: number,
  opts: RunPullOptions,
): Promise<VikunjaResponse<VikunjaPullOutcome>> {
  // The config is `unknown` here (it is validated inside `withVikunjaClient`),
  // and the snapshot is keyed per instance — so the host is derived defensively
  // rather than read off a trusted shape.
  const host = snapshotHost((cfg as { baseUrl?: unknown } | null)?.baseUrl)
  const previous = await readSnapshot(host, projectId, viewId)

  if (!opts.force && previous && isFresh(previous, Date.now())) {
    return {
      ok: true,
      value: {
        tasks: previous.tasks,
        pulledAt: previous.pulledAt,
        delta: emptyDelta(),
        // Nothing was written because nothing was read; the snapshot we just
        // served from is by definition still there.
        persisted: true,
      },
    }
  }

  return withVikunjaClient<VikunjaPullOutcome>(cfg, async (client) => {
    const out = await client.getViewTasks(projectId, viewId, { retry: opts.retry !== false })
    if (!out.ok) return out

    const tasks = out.value.flatMap((bucket) =>
      (bucket.tasks ?? []).map((task) => toPulledTask(task, bucket.id)),
    )
    const delta = computeDelta(previous?.tasks ?? null, tasks)
    const pulledAt = Date.now()

    const persisted = await writeSnapshot({ host, projectId, viewId, tasks, pulledAt })
    announce({ projectId, viewId, pulledAt, delta, persisted, firstSnapshot: previous === null })

    return { ok: true, value: { tasks, pulledAt, delta, persisted } }
  })
}

/**
 * Tells the open pages about a read that found something — whoever started
 * it.
 *
 * There is no loop to worry about: a page answers `vikunja/pulled` with a
 * *silent* sync, which pulls unforced, which is served from the snapshot this
 * very read just wrote (well inside `VIKUNJA_SNAPSHOT_FRESH_MS`), so it makes
 * no request and reaches no broadcast.
 *
 * The one case that is held back is a **first** read whose snapshot did not
 * persist. Then the woken tabs have nothing to be served from, each would
 * read the instance for itself, and each of those reads would again see "no
 * previous snapshot" and broadcast — a storm proportional to the number of
 * open tabs. A warning is the honest outcome instead.
 */
function announce(event: {
  projectId: number
  viewId: number
  pulledAt: number
  delta: VikunjaPullDelta
  persisted: boolean
  firstSnapshot: boolean
}): void {
  if (isEmptyDelta(event.delta)) return

  if (event.firstSnapshot && !event.persisted) {
    // Ids and counts only; never the host, the token or a task's text.
    console.warn('[vikunja] snapshot not persisted', {
      projectId: event.projectId,
      viewId: event.viewId,
    })
    return
  }

  broadcastVikunja({
    type: 'vikunja/pulled',
    projectId: event.projectId,
    viewId: event.viewId,
    at: event.pulledAt,
    delta: toDeltaCounts(event.delta),
  })
}
