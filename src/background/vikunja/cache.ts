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
  VIKUNJA_SNAPSHOT_TOTAL_MAX_BYTES,
} from '@/background/vikunja/constants.ts'
import {
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
} from '@/background/vikunja/messages.ts'

import type { VikunjaPulledTask } from '@/background/vikunja/messages.ts'

/**
 * One key per view **of one instance**, so neither two configured projects
 * nor two instances can overwrite each other.
 *
 * The host matters because project and view ids are per instance: someone who
 * moves the widget from a test instance to their real one (or runs both) has
 * every chance of hitting the same `1:4` pair, and a delta computed against
 * the other server's tasks would report its whole board as removed.
 */
export const VIKUNJA_SNAPSHOT_PREFIX = 'vikunja:snapshot:'

/** Host used when the config does not carry a parseable instance URL. */
const UNKNOWN_HOST = 'unknown'

export interface VikunjaSnapshot {
  /** Instance host, as `snapshotHost` derives it from the config's baseUrl. */
  host: string
  projectId: number
  viewId: number
  tasks: VikunjaPulledTask[]
  /** When the read that produced it finished. */
  pulledAt: number
}

/**
 * Host of an instance URL, for the key above.
 *
 * Takes the raw config value because the worker keeps no state and every op
 * arrives with its own `cfg`; anything unparseable collapses to one shared
 * bucket rather than throwing — a cache must not be the thing that breaks a
 * pull.
 */
export function snapshotHost(baseUrl: unknown): string {
  if (typeof baseUrl !== 'string') return UNKNOWN_HOST
  try {
    return new URL(baseUrl).host || UNKNOWN_HOST
  } catch {
    return UNKNOWN_HOST
  }
}

export function snapshotKey(host: string, projectId: number, viewId: number): string {
  return `${VIKUNJA_SNAPSHOT_PREFIX}${host}:${projectId}:${viewId}`
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
 *
 * `z.object` strips what it does not know, which is what makes a snapshot
 * written by an older build — one that still carried `labelIds` — parse
 * rather than be thrown away: a dropped snapshot would report the whole board
 * as `added` on the next pull.
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
})

const snapshotSchema: z.ZodType<VikunjaSnapshot> = z.object({
  host: z.string().min(1),
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
 * The snapshot for this view of this instance, or `null` when there is none,
 * it does not parse, or it belongs somewhere else.
 *
 * The last case is not paranoia for its own sake: the key is built from the
 * host and the pair, so a record whose body disagrees with its key was
 * written by something other than `writeSnapshot`, and a delta computed
 * against another project's tasks would report that board's every task as
 * removed.
 */
export async function readSnapshot(
  host: string,
  projectId: number,
  viewId: number,
): Promise<VikunjaSnapshot | null> {
  const area = localArea()
  if (!area) return null

  const key = snapshotKey(host, projectId, viewId)
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
  if (parsed.data.host !== host) return null
  if (parsed.data.projectId !== projectId || parsed.data.viewId !== viewId) return null
  return parsed.data
}

/**
 * How many bytes one board's snapshot may take, given how many boards share
 * the connection's total.
 *
 * `boardCount` is the number of boards the schedule holds, not the number
 * that happen to have a snapshot: the budget has to be the same for each of
 * them however they are read, or the board that happens to be pulled first
 * would take the lot. Anything unusable (zero, a fraction, `undefined` from a
 * caller that pulls one view on its own) falls back to one board, which is
 * simply the per-board cap.
 */
export function snapshotBudgetBytes(boardCount: number | undefined): number {
  const boards =
    Number.isInteger(boardCount) && (boardCount as number) > 0 ? (boardCount as number) : 1
  return Math.min(VIKUNJA_SNAPSHOT_MAX_BYTES, Math.floor(VIKUNJA_SNAPSHOT_TOTAL_MAX_BYTES / boards))
}

/**
 * Trims the snapshot to both of its budgets: at most
 * `VIKUNJA_SNAPSHOT_MAX_TASKS` tasks, and at most `maxBytes` of JSON.
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
function withinBudget(snapshot: VikunjaSnapshot, maxBytes: number): VikunjaSnapshot {
  const capped: VikunjaSnapshot =
    snapshot.tasks.length > VIKUNJA_SNAPSHOT_MAX_TASKS
      ? { ...snapshot, tasks: snapshot.tasks.slice(0, VIKUNJA_SNAPSHOT_MAX_TASKS) }
      : snapshot

  if (JSON.stringify(capped).length <= maxBytes) return capped

  let used = JSON.stringify({ ...capped, tasks: [] }).length
  const kept: VikunjaPulledTask[] = []
  for (const task of capped.tasks) {
    // `+ 1` for the comma that would separate it from the previous element;
    // over-counting by one byte per task is the safe direction.
    const cost = JSON.stringify(task).length + 1
    if (used + cost > maxBytes) break
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
 *
 * `maxBytes` defaults to the per-board cap, which is what a caller reading a
 * single view on its own should spend; the alarm passes the divided budget
 * (see `snapshotBudgetBytes`) so a connection with many boards cannot
 * multiply the cap by their number.
 */
export async function writeSnapshot(
  snapshot: VikunjaSnapshot,
  maxBytes: number = VIKUNJA_SNAPSHOT_MAX_BYTES,
): Promise<boolean> {
  const area = localArea()
  if (!area) return false

  const bounded = withinBudget(snapshot, maxBytes)

  try {
    await area.set({ [snapshotKey(bounded.host, bounded.projectId, bounded.viewId)]: bounded })
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
 * Drops the snapshots of **this instance** that no longer belong to a board
 * the schedule names.
 *
 * The garbage a live connection produces: a board removed from the config, or
 * one re-pointed at another view (`withScope` changes `viewId`, which changes
 * the key). Neither has anything left to invalidate it — the pull only ever
 * writes the keys it reads — so without this they sit in
 * `chrome.storage.local`, a quota every widget shares, for as long as the
 * integration is connected.
 *
 * Scoped to one host on purpose. A key of another instance is not this
 * connection's to judge: the user may be moving between two servers, and
 * `clearSnapshots` (on disconnect) is what sweeps those.
 */
export async function pruneSnapshots(
  host: string,
  boards: readonly { projectId: number; viewId: number }[],
): Promise<void> {
  const area = localArea()
  if (!area) return

  const keep = new Set(boards.map((board) => snapshotKey(host, board.projectId, board.viewId)))
  const prefix = `${VIKUNJA_SNAPSHOT_PREFIX}${host}:`

  try {
    const stale = (await listKeys(area)).filter((key) => key.startsWith(prefix) && !keep.has(key))
    if (stale.length === 0) return
    await area.remove(stale)
  } catch (err) {
    console.warn('[vikunja] snapshot prune failed', {
      error: err instanceof Error ? err.name : 'unknown',
    })
  }
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
