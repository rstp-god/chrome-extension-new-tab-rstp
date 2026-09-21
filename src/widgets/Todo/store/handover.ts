/**
 * The copy of the task list the widget leaves behind when a connection goes
 * away — building it, writing it, and throwing it away when it is too old to
 * be of use.
 *
 * Its own module because all three have rules worth reading on their own: the
 * snapshot must never carry credentials, it must fit a byte budget it shares
 * with the rest of the extension's storage, and it must not outlive its
 * purpose. `store.ts` calls three functions and stays about state.
 */

import { getArea, removeArea, setArea } from '@/services/chrome/storage.ts'

import { TODO_HANDOVER_KEY } from './keys.ts'
import {
  TODO_HANDOVER_MAX_BYTES,
  TODO_HANDOVER_TTL_MS,
  todoHandoverSchema,
  type IntegrationState,
  type TodoHandoverSnapshot,
  type TodoTask,
} from './schema.ts'

export { TODO_HANDOVER_KEY }

/** Bytes of a value's JSON, which is what a storage quota actually counts. */
function jsonByteLength(value: unknown): number {
  const json = JSON.stringify(value)
  // `TextEncoder` is everywhere the extension runs; the fallback keeps a
  // stripped environment (an old jsdom, a worker polyfill) from throwing —
  // it under-counts non-ASCII, which only makes the budget stricter here.
  if (typeof TextEncoder === 'undefined') return json.length
  return new TextEncoder().encode(json).length
}

/**
 * The snapshot for this state, or `null` when there is nothing to snapshot.
 *
 * Pure, so the two rules that matter can be tested without storage: what it
 * carries (never the config — see `todoHandoverSchema`) and how it stays
 * within the budget. Tasks are kept from the head and dropped from the tail,
 * costed once each: a JSON array's length is the empty record plus every
 * element plus a comma between them, so one pass costs one `stringify` per
 * task rather than one per candidate size.
 */
export function buildHandoverSnapshot(
  integration: IntegrationState,
  tasks: readonly TodoTask[],
  now: number,
): TodoHandoverSnapshot | null {
  const head = {
    version: 1 as const,
    savedAt: now,
    integrationName: integration.name,
    boardName: integration.boardName,
  }

  let used = jsonByteLength({ ...head, tasks: [] })
  const kept: TodoTask[] = []
  for (const task of tasks) {
    // `+ 1` for the comma that would separate it from the previous element;
    // over-counting by one byte per task is the safe direction.
    const cost = jsonByteLength(task) + 1
    if (used + cost > TODO_HANDOVER_MAX_BYTES) break
    used += cost
    kept.push(task)
  }

  const candidate = {
    ...head,
    tasks: kept,
    ...(kept.length < tasks.length ? { truncated: true } : {}),
  }

  // The schema is also the filter: `z.object` strips what it does not
  // declare, so nothing from the config can travel with the copy even if a
  // field is added to the state above.
  const parsed = todoHandoverSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

/**
 * Writes the copy for this state, tolerating every way that can fail.
 *
 * A snapshot is a courtesy: neither a candidate the schema refuses nor a
 * storage write that fails may stop the disconnect the user asked for. Being
 * unable to save a backup is not a reason to refuse to let go of the
 * integration.
 */
export async function saveHandoverSnapshot(
  integration: IntegrationState | null,
  tasks: readonly TodoTask[],
  now = Date.now(),
): Promise<void> {
  if (!integration) return

  const snapshot = buildHandoverSnapshot(integration, tasks, now)
  if (!snapshot) return

  try {
    await setArea('local', TODO_HANDOVER_KEY, snapshot)
  } catch (err) {
    // The name, not the error: the snapshot is task text, and a storage
    // failure's message can quote what it refused.
    console.warn('[todo] handover snapshot write failed', {
      error: err instanceof Error ? err.name : 'unknown',
    })
  }
}

/**
 * Drops the copy once it is older than the TTL. Called once per store init —
 * the only moment anything looks at this key at all.
 *
 * A record this cannot parse is left alone rather than deleted: it may have
 * been written by a newer version of the widget, and a cleanup routine that
 * removes what it does not understand is how a future format loses its data
 * to an old tab.
 */
export async function expireHandoverSnapshot(now = Date.now()): Promise<void> {
  try {
    const raw = await getArea<unknown>('local', TODO_HANDOVER_KEY)
    if (raw === null) return

    const parsed = todoHandoverSchema.safeParse(raw)
    if (!parsed.success) return
    if (now - parsed.data.savedAt < TODO_HANDOVER_TTL_MS) return

    await removeArea('local', TODO_HANDOVER_KEY)
  } catch (err) {
    console.warn('[todo] handover snapshot cleanup failed', {
      error: err instanceof Error ? err.name : 'unknown',
    })
  }
}
