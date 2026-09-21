/**
 * The one-way upgrade of the persisted Todo state: the single-board Vikunja
 * config into `boards[]`.
 *
 * It is wrapped around `todoPersistedStateSchema` as a `z.preprocess`, so
 * every read of the envelope — the store's load, the `storage.onChanged`
 * merge, a test parsing a fixture — sees the new shape, and nothing
 * downstream has to know an older one ever existed.
 *
 * Three rules it lives by:
 *
 * - **anything that is not an old single-board Vikunja state comes back as
 *   the very same reference.** A Trello envelope — whose byte-identity is a
 *   data-loss contract, see `tests/unit/todo/persistedSchema.test.ts` — a
 *   state that already carries `boards`, `integration: null`, garbage: all
 *   untouched, not even cloned, so an upgrade nobody needs cannot reorder a
 *   key or drop a field;
 * - **the input is never mutated.** These are the bytes a caller read out of
 *   `chrome.storage`, and a preprocess that edited them in place would change
 *   what a second parse of the same object sees;
 * - **nothing is thrown away.** The board it builds keeps the cached title,
 *   containers and mapping of the single view the config described — and the
 *   slice's own `boardName` / `lists` / `mapping`, having been *moved* onto
 *   that board, are emptied. Nothing reads them for this backend any more
 *   (the descriptor's `getSetupStep` / `isReadyToSync` answer from the boards,
 *   and the wizard and the summary read the board itself), and a copy nobody
 *   updates is a copy a later reader would trust by mistake.
 *
 * The one lossy input is a config whose `projectId` or `viewId` is not a
 * positive integer — a hand-edited or half-written record. It describes no
 * board the widget could address, so it upgrades to `boards: []` and the
 * refs of its tasks, having no board to name, are dropped to `null` by the
 * ref schema's `.catch(null)`; the tasks themselves survive and the next
 * sync re-links them.
 */

/** A plain object — an array and `null` are neither. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Does the record carry this field *itself*?
 *
 * `Object.prototype.hasOwnProperty.call`, the form the rest of `src` uses
 * (`background/activity/rollup.ts`) because the app is compiled against the
 * ES2020 lib and has no `Object.hasOwn`. Either way the point is the same:
 * a plain `in` — or a property read compared against `undefined` — also
 * answers for whatever sits on the prototype chain, and these records come
 * out of storage.
 */
function hasOwn(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field)
}

/** A Vikunja id as the schema accepts it: a positive integer, or nothing. */
function asPositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/**
 * The board an old config described, in the shape `vikunjaBoardSchema` wants
 * — as far as this module can vouch for it. The two ids, the name and the
 * mode are checked here; `containers` and `mapping` are the slice's own
 * values passed through, so they are honestly `unknown` until the schema
 * parses them.
 */
interface UpgradedBoard {
  projectId: number
  viewId: number
  name: string
  containers: unknown[]
  mapping: unknown
  kanbanMapping: boolean
}

/**
 * The single board an old config described, or `null` when it never addressed
 * one: a project without a view names no task list, and half a scope has
 * never been a board (`getScope` refused it then too).
 *
 * `name` and `containers` are type-checked rather than passed through. A
 * hand-edited title would fail the slice's own schema as well, but there it
 * costs one cached string — inside the *config* it would take the whole
 * integration down, and with it the instance URL and the token the user
 * typed.
 */
function upgradedBoard(
  config: Record<string, unknown>,
  integration: Record<string, unknown>,
): UpgradedBoard | null {
  const projectId = asPositiveInt(config.projectId)
  const viewId = asPositiveInt(config.viewId)
  if (projectId === null || viewId === null) return null

  return {
    projectId,
    viewId,
    name: typeof integration.boardName === 'string' ? integration.boardName : '',
    containers: Array.isArray(integration.lists) ? integration.lists : [],
    mapping: integration.mapping ?? null,
    kanbanMapping: typeof config.kanbanMapping === 'boolean' ? config.kanbanMapping : true,
  }
}

/**
 * A Vikunja ref that does not know its board yet.
 *
 * `taskId` is the field the ref union has always been told apart by (see the
 * comment on `remoteTaskRefSchema`), so it is what identifies a ref worth
 * upgrading here — and a ref that already carries a `projectId` is left
 * alone, whatever it holds.
 */
function needsProjectId(ref: unknown): ref is Record<string, unknown> {
  return isRecord(ref) && typeof ref.taskId === 'number' && !hasOwn(ref, 'projectId')
}

/**
 * Every task's ref told which board it lives on. Tasks that need nothing keep
 * their own reference — only the refs that change are rebuilt.
 */
function withRefProjectId(tasks: unknown[], projectId: number): unknown[] {
  return tasks.map((task) => {
    if (!isRecord(task) || !needsProjectId(task.remoteRef)) return task
    return { ...task, remoteRef: { ...task.remoteRef, projectId } }
  })
}

/**
 * The persisted state as the current schema expects it.
 *
 * A task whose ref is left without a `projectId` — which happens only when
 * the config named no board at all, so there is nothing truthful to write —
 * fails the ref schema and degrades to `remoteRef: null` through the existing
 * `.catch(null)`. That is the intended outcome: an unaddressable ref is worth
 * less than the task it hangs off, and the next sync re-links it.
 */
export function upgradePersistedState(raw: unknown): unknown {
  if (!isRecord(raw)) return raw

  const integration = raw.integration
  if (!isRecord(integration) || integration.name !== 'vikunja') return raw

  const config = integration.config
  // `boards` is the marker of the new shape, and the only question asked
  // here: a config that has it has been upgraded already (or was written by
  // this version), and re-running the upgrade over it would rebuild the
  // board from a mirror the widget is no longer the only writer of.
  if (!isRecord(config) || hasOwn(config, 'boards')) return raw

  const board = upgradedBoard(config, integration)
  const nextConfig: Record<string, unknown> = {
    baseUrl: config.baseUrl,
    token: config.token,
    boards: board ? [board] : [],
    // Never an id without a board behind it: `defaultProjectId` answers
    // "where does a new task go", and pointing it at a project this config
    // cannot address would be a promise nothing can keep.
    defaultProjectId: board?.projectId ?? null,
  }
  // Absent stays absent — the worker's default is the whole point of the
  // field being optional (see `vikunjaConfigSchema`).
  if (config.pullPeriodMin !== undefined) nextConfig.pullPeriodMin = config.pullPeriodMin

  const tasks =
    board && Array.isArray(raw.tasks) ? withRefProjectId(raw.tasks, board.projectId) : raw.tasks

  return {
    ...raw,
    tasks,
    // The three single-board slice fields are emptied rather than carried
    // over: their values are on the board now, and this backend's readers all
    // go through it. See the module comment.
    integration: { ...integration, config: nextConfig, boardName: null, lists: [], mapping: null },
  }
}
