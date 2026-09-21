/**
 * The worker's snapshot of one Vikunja view: the last full pull, kept in
 * `chrome.storage.local` so it survives the service worker being unloaded.
 *
 * Two jobs, both of which need the *previous* read to still be around after
 * MV3 has thrown the worker away:
 *
 * 1. the delta — "what changed" can only be answered against something, and a
 *    pull is always full (recon §2.2), so the something is the previous full
 *    read;
 * 2. the cheap answer — a sync a page only started because the worker
 *    broadcast a change is served straight from here instead of reading the
 *    user's instance once per open tab.
 *
 * **`local` only, never `sync`.** A snapshot is someone's task list, it is
 * written on every background pull, and `storage.sync` is both quota-tiny and
 * mirrored through Google's servers. `tests/unit/.../cache.test.ts` asserts
 * this module never so much as touches `chrome.storage.sync`.
 *
 * Everything here degrades instead of throwing: a snapshot is a cache, and a
 * corrupt or unreadable one must cost a network read, not a failed sync.
 */

import { z } from 'zod'

import {
  VIKUNJA_SNAPSHOT_MAX_BYTES,
  VIKUNJA_SNAPSHOT_MAX_TASKS,
} from '@/background/vikunja/constants.ts'
import {
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
} from '@/background/vikunja/messages.ts'

import type { VikunjaPulledTask } from '@/background/vikunja/messages.ts'

/** One key per view, so two configured projects cannot overwrite each other. */
export const VIKUNJA_SNAPSHOT_PREFIX = 'vikunja:snapshot:'

export interface VikunjaSnapshot {
  projectId: number
  viewId: number
  tasks: VikunjaPulledTask[]
  /** When the read that produced it finished. */
  pulledAt: number
}

export function snapshotKey(projectId: number, viewId: number): string {
  return `${VIKUNJA_SNAPSHOT_PREFIX}${projectId}:${viewId}`
}

/**
 * The worker's own copy of the pulled-task shape.
 *
 * Deliberately not the widget's `vikunjaPulledTaskSchema`: the worker may not
 * import widget code (see the boundary rule in `messages.ts`). Annotated
 * against the shared interface instead, so a field renamed in `messages.ts`
 * breaks the build here rather than turning into `undefined` at runtime.
 *
 * Validated on read even though the worker wrote it: a storage record is
 * editable by anything with the extension's id on the user's own machine, and
 * these ids end up in a delta the widget acts on.
 */
const pulledTaskSchema: z.ZodType<VikunjaPulledTask> = z.object({
  id: z.number().int().positive(),
  identifier: z.string(),
  title: z.string().max(VIKUNJA_MAX_TITLE_LENGTH),
  description: z.string().max(VIKUNJA_MAX_DESCRIPTION_LENGTH),
  done: z.boolean(),
  doneAt: z.string().nullable(),
  bucketId: z.number(),
  created: z.string(),
  updated: z.string(),
  labelIds: z.array(z.number()),
})

const snapshotSchema: z.ZodType<VikunjaSnapshot> = z.object({
  projectId: z.number().int().positive(),
  viewId: z.number().int().positive(),
  // The same ceiling `writeSnapshot` truncates to: a longer record did not
  // come from us, and reading it would undo the bound.
  tasks: z.array(pulledTaskSchema).max(VIKUNJA_SNAPSHOT_MAX_TASKS),
  pulledAt: z.number(),
})

/**
 * `chrome.storage.local` read through `globalThis`, so the module is usable
 * (as a no-op cache) wherever `chrome` is absent — tests, the showcase build,
 * a worker whose APIs were stripped.
 */
function localArea(): chrome.storage.LocalStorageArea | null {
  return (globalThis as { chrome?: typeof chrome }).chrome?.storage?.local ?? null
}

/**
 * The snapshot for this view, or `null` when there is none, it does not
 * parse, or it belongs to another view.
 *
 * The last case is not paranoia for its own sake: the key is built from the
 * pair, so a record whose body disagrees with its key was written by
 * something other than `writeSnapshot`, and a delta computed against another
 * project's tasks would report that board's every task as removed.
 */
export async function readSnapshot(
  projectId: number,
  viewId: number,
): Promise<VikunjaSnapshot | null> {
  const area = localArea()
  if (!area) return null

  const key = snapshotKey(projectId, viewId)
  let raw: unknown
  try {
    const items = await area.get(key)
    raw = items[key]
  } catch {
    // Storage unavailable (quota error, worker shutting down): no cache.
    return null
  }

  if (raw === undefined) return null

  const parsed = snapshotSchema.safeParse(raw)
  if (!parsed.success) return null
  if (parsed.data.projectId !== projectId || parsed.data.viewId !== viewId) return null
  return parsed.data
}

/**
 * Trims the snapshot to both of its budgets: at most
 * `VIKUNJA_SNAPSHOT_MAX_TASKS` tasks, and at most
 * `VIKUNJA_SNAPSHOT_MAX_BYTES` of JSON.
 *
 * The count cap alone is not enough — a description is rich text bounded at
 * 16 KiB, so the cap allows a theoretically enormous record — and a byte cap
 * alone would let one pathological task cost the whole budget. Trailing tasks
 * are dropped, so the board's own order decides what survives.
 *
 * Sized task by task rather than by re-serialising the whole record after
 * every drop: a JSON array's length is the empty record plus each element
 * plus one comma between them, so one pass costs one `stringify` per task
 * instead of one per candidate size.
 */
function withinBudget(snapshot: VikunjaSnapshot): VikunjaSnapshot {
  const capped: VikunjaSnapshot =
    snapshot.tasks.length > VIKUNJA_SNAPSHOT_MAX_TASKS
      ? { ...snapshot, tasks: snapshot.tasks.slice(0, VIKUNJA_SNAPSHOT_MAX_TASKS) }
      : snapshot

  if (JSON.stringify(capped).length <= VIKUNJA_SNAPSHOT_MAX_BYTES) return capped

  let used = JSON.stringify({ ...capped, tasks: [] }).length
  const kept: VikunjaPulledTask[] = []
  for (const task of capped.tasks) {
    // `+ 1` for the comma that would separate it from the previous element;
    // over-counting by one byte per task is the safe direction.
    const cost = JSON.stringify(task).length + 1
    if (used + cost > VIKUNJA_SNAPSHOT_MAX_BYTES) break
    used += cost
    kept.push(task)
  }

  return { ...capped, tasks: kept }
}

/**
 * Persists a snapshot, trimmed to the documented budgets. Answers whether the
 * write landed: a first pull whose snapshot did not persist must not be
 * broadcast (see `announce` in `pull.ts`), so this is a result rather than a
 * throw.
 */
export async function writeSnapshot(snapshot: VikunjaSnapshot): Promise<boolean> {
  const area = localArea()
  if (!area) return false

  const bounded = withinBudget(snapshot)

  try {
    await area.set({ [snapshotKey(bounded.projectId, bounded.viewId)]: bounded })
    return true
  } catch (err) {
    // Only the error's name: a quota message can embed the record it refused.
    console.warn('[vikunja] snapshot write failed', {
      error: err instanceof Error ? err.name : 'unknown',
    })
    return false
  }
}

/**
 * Every key in the area.
 *
 * `getKeys()` (Chrome 130+) answers with the names alone; `get(null)` — the
 * fallback — reads every *value* the extension has ever stored, which for
 * this feature means pulling a task list into memory only to throw it away.
 * Preferring the cheap call is what makes clearing snapshots something the
 * worker can do without thinking about it.
 */
async function listKeys(area: chrome.storage.LocalStorageArea): Promise<string[]> {
  const withKeys = area as chrome.storage.LocalStorageArea & { getKeys?: () => Promise<string[]> }
  if (typeof withKeys.getKeys === 'function') return withKeys.getKeys()
  return Object.keys(await area.get(null))
}

/**
 * Drops every snapshot, whatever view it belongs to.
 *
 * Used when the integration goes away (disconnect wipes the Todo envelope, the
 * alarm notices and clears up after itself): a cached task list of a project
 * the user has just unlinked is stale data nobody will ever invalidate.
 */
export async function clearSnapshots(): Promise<void> {
  const area = localArea()
  if (!area) return

  try {
    const keys = (await listKeys(area)).filter((key) => key.startsWith(VIKUNJA_SNAPSHOT_PREFIX))
    if (keys.length === 0) return
    await area.remove(keys)
  } catch (err) {
    console.warn('[vikunja] snapshot clear failed', {
      error: err instanceof Error ? err.name : 'unknown',
    })
  }
}
