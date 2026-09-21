/**
 * The background half of the Vikunja integration: a periodic `chrome.alarms`
 * job that pulls the configured view so the widget finds out about a task
 * somebody changed elsewhere.
 *
 * Three constraints shape everything here.
 *
 * **`chrome.alarms`, never a timer.** MV3 unloads the service worker after
 * ~30 s of idle, taking every `setInterval` with it. An alarm survives that,
 * which is the only reason a "background pull" can exist at all. The same
 * fact is why the read itself does not retry (`retry: false`): a 5xx is
 * answered by the *next tick*, not by sitting on a 12-second backoff inside a
 * worker Chrome is entitled to kill.
 *
 * **Listeners register synchronously, at module scope** (see
 * `setupVikunjaPull` and the comment in `src/background/index.ts`). The event
 * that woke a cold worker is dispatched as soon as the script finishes
 * evaluating, so a listener attached behind an `await` misses the very alarm
 * that started the worker — and the next one is a whole period away.
 *
 * **The worker has no config but storage.** It keeps nothing between
 * wake-ups, so the schedule is parsed out of the Todo widget's envelope on
 * every alarm — with a minimal schema of its own, because the worker may not
 * import the widget's (boundary rule in `messages.ts`).
 *
 * Note what is *not* here: the `vikunja/pulled` broadcast. Every real read
 * announces itself from `pull.ts`, whichever caller started it, so a manual
 * sync in one tab reaches the others too. The alarm only owns the failures,
 * which nobody else is in a position to notice.
 */

import { z } from 'zod'

import { broadcastVikunja, swallowRejection } from '@/background/vikunja/broadcast.ts'
import { clearSnapshots } from '@/background/vikunja/cache.ts'
import {
  VIKUNJA_PULL_ALARM,
  VIKUNJA_PULL_PERIOD_MIN,
  VIKUNJA_PULL_PERIODS_MIN,
  VIKUNJA_TODO_STORAGE_KEY,
} from '@/background/vikunja/constants.ts'
import { runPull } from '@/background/vikunja/pull.ts'

import type {
  VikunjaErrorKey,
  VikunjaPullPeriod,
  VikunjaWire,
} from '@/background/vikunja/messages.ts'

/** Everything the alarm needs to do its job, read out of storage. */
export interface VikunjaSchedule {
  cfg: VikunjaWire
  projectId: number
  viewId: number
  periodMin: VikunjaPullPeriod
}

/**
 * The worker's minimal view of the Todo envelope: the credentials, the board
 * to pull, and whether the user finished the mapping wizard for it.
 *
 * Deliberately not the widget's `todoEnvelopeSchema` — the worker must not
 * import widget code — and deliberately *narrower* than it: this schema is
 * not a data-loss contract, it is a question ("is there a Vikunja view to
 * pull, and how often"). So it reads the fields that answer it and ignores
 * the tasks, the cached buckets and everything else the widget keeps.
 *
 * **Both persisted shapes are accepted**, and they have to be. The widget
 * upgrades the single-board config to `boards[]` when it *parses* the
 * envelope, which does not touch the bytes until the page writes them back;
 * a worker that understood only the new shape would stop pulling for every
 * existing user in the meantime. The legacy branch can go once a release has
 * passed and the write-back has run everywhere.
 *
 * `baseUrl` is only length-bounded here: the real check (https, literal host)
 * belongs to `vikunjaWireSchema` inside the gate, and duplicating it would be
 * a second place for it to drift.
 *
 * `pullPeriodMin` is a plain optional number rather than the 1/5/15 union so
 * that a hand-edited or future-dated value degrades to the default instead of
 * failing the whole parse and silently stopping the background pull. The
 * narrowing to the allowlist happens below.
 */
const credentialsSchema = z.object({
  baseUrl: z.string().max(2048),
  token: z.string().min(1).max(4096),
  pullPeriodMin: z.number().optional(),
})

/**
 * One board, with only its presence checked for the mapping: a board whose
 * buckets are not mapped has nowhere to put a pulled task, so pulling for it
 * would be work nobody can use. `null` until the wizard is done.
 */
const boardSchema = z.object({
  projectId: z.number().int().positive(),
  viewId: z.number().int().positive(),
  mapping: z.record(z.string(), z.unknown()).nullable(),
})

/** The current shape: every board in the config, each with its own mapping. */
const boardsEnvelopeSchema = z.object({
  state: z.object({
    integration: z.object({
      name: z.literal('vikunja'),
      config: credentialsSchema.extend({
        boards: z.array(boardSchema),
        defaultProjectId: z.number().int().positive().nullable(),
      }),
    }),
  }),
})

/** The single-board shape: the scope in the config, the mapping on the slice. */
const legacyEnvelopeSchema = z.object({
  state: z.object({
    integration: z.object({
      name: z.literal('vikunja'),
      config: credentialsSchema.extend({
        projectId: z.number().int().positive(),
        viewId: z.number().int().positive(),
      }),
      mapping: z.record(z.string(), z.unknown()).nullable(),
    }),
  }),
})

type ScheduleBoard = z.infer<typeof boardSchema>

/**
 * The board this alarm pulls: the one `defaultProjectId` names, the first one
 * when it names nothing.
 *
 * **Only the default board, for now.** One alarm cannot say which board woke
 * it, so pulling all of them needs a key per board (and a period that is not
 * multiplied by the number of boards) — that is task 3. Until then a second
 * board is synced when the widget itself asks.
 */
function defaultScheduleBoard(config: {
  boards: ScheduleBoard[]
  defaultProjectId: number | null
}): ScheduleBoard | null {
  const [first] = config.boards
  if (first === undefined) return null
  if (config.defaultProjectId === null) return first

  return config.boards.find((board) => board.projectId === config.defaultProjectId) ?? first
}

function chromeObject(): typeof chrome | null {
  return (globalThis as { chrome?: typeof chrome }).chrome ?? null
}

/** One of the offered periods, or the default. Never anything else. */
function resolvePeriod(raw: number | undefined): VikunjaPullPeriod {
  const offered = VIKUNJA_PULL_PERIODS_MIN.find((period) => period === raw)
  return offered ?? VIKUNJA_PULL_PERIOD_MIN
}

/**
 * The schedule one stored envelope asks for, or `null` when there is nothing
 * to pull: no integration, a different backend, half a scope, or a mapping
 * the user never finished.
 *
 * Takes the record rather than reading storage so the `storage.onChanged`
 * listener can parse the `newValue` Chrome already handed it — the change
 * event carries the whole envelope, and going back to storage for it is a
 * read per edited task.
 *
 * `null` is not an error — it is the normal answer for a widget with no
 * Vikunja connected, and it is what tells `applySchedule` to clean up.
 */
export function readVikunjaScheduleFrom(raw: unknown): VikunjaSchedule | null {
  if (raw === undefined || raw === null) return null

  const current = boardsEnvelopeSchema.safeParse(raw)
  if (current.success) {
    const { config } = current.data.state.integration
    const board = defaultScheduleBoard(config)
    if (!board || board.mapping === null) return null

    return {
      cfg: { baseUrl: config.baseUrl, token: config.token },
      projectId: board.projectId,
      viewId: board.viewId,
      periodMin: resolvePeriod(config.pullPeriodMin),
    }
  }

  // Bytes written by the single-board build, still on disk until the page
  // that upgraded them writes them back — see the schema comment above.
  const legacy = legacyEnvelopeSchema.safeParse(raw)
  if (!legacy.success) return null

  const { config, mapping } = legacy.data.state.integration
  if (mapping === null) return null

  return {
    cfg: { baseUrl: config.baseUrl, token: config.token },
    projectId: config.projectId,
    viewId: config.viewId,
    periodMin: resolvePeriod(config.pullPeriodMin),
  }
}

/**
 * The same answer, read from storage. Used by the paths that have no event to
 * read it from: worker start, and the alarm actually firing.
 */
export async function readVikunjaScheduleFromStorage(): Promise<VikunjaSchedule | null> {
  const local = chromeObject()?.storage?.local
  if (!local) return null

  try {
    const items = await local.get(VIKUNJA_TODO_STORAGE_KEY)
    return readVikunjaScheduleFrom(items[VIKUNJA_TODO_STORAGE_KEY])
  } catch {
    // Storage unreadable: treat as "nothing scheduled" rather than throwing
    // inside an alarm handler, where there is nobody to catch it.
    return null
  }
}

async function getExistingAlarm(): Promise<chrome.alarms.Alarm | null> {
  const alarms = chromeObject()?.alarms
  if (!alarms?.get) return null
  try {
    return (await alarms.get(VIKUNJA_PULL_ALARM)) ?? null
  } catch {
    return null
  }
}

/** Drops the alarm. Safe to call when there is none. */
async function clearAlarm(): Promise<void> {
  const alarms = chromeObject()?.alarms
  if (!alarms?.clear) return
  try {
    await alarms.clear(VIKUNJA_PULL_ALARM)
  } catch {
    // Nothing to clear, or the API is gone with the worker.
  }
}

/**
 * Brings the alarm in line with one schedule.
 *
 * Re-created only when the period actually differs: `chrome.alarms.create`
 * with an existing name replaces the alarm and restarts its interval, so
 * calling it unconditionally on every `storage.onChanged` — which fires for
 * every task the user ticks off — would keep pushing the next pull away and a
 * busy widget would never pull at all.
 *
 * With nothing scheduled the alarm goes *and* the snapshots go with it — but
 * only when there *was* an alarm. That condition is what keeps a Trello user
 * (or a local list) from paying for a storage sweep on every edit: no alarm
 * means this feature has nothing stored, so there is nothing to clean.
 */
async function applySchedule(schedule: VikunjaSchedule | null): Promise<void> {
  const existing = await getExistingAlarm()

  if (!schedule) {
    // Not merely "no schedule" but the transition into it: the disconnect
    // path (`clearIntegration` wipes the local envelope) is the only way an
    // alarm and its snapshots become garbage.
    if (!existing) return
    await clearAlarm()
    await clearSnapshots()
    return
  }

  if (existing && existing.periodInMinutes === schedule.periodMin) return

  const alarms = chromeObject()?.alarms
  if (!alarms?.create) return
  try {
    // Promise-style on modern Chrome, `void` on older builds; either way a
    // rejection here is not worth an unhandled promise in the worker.
    swallowRejection(alarms.create(VIKUNJA_PULL_ALARM, { periodInMinutes: schedule.periodMin }))
  } catch (err) {
    console.warn('[vikunja] pull alarm create failed', {
      error: err instanceof Error ? err.name : 'unknown',
    })
  }
}

/**
 * One alarm reconciliation at a time.
 *
 * `storage.onChanged` fires for every task edit, and each run is a couple of
 * `chrome.alarms` round trips; two of them interleaving would both read "no
 * alarm" and both create one. A request that arrives while a run is in flight
 * is not dropped either — it sets `queued`, and the tail re-reads storage,
 * which is authoritative for whatever the events raced over.
 */
let running: Promise<void> | null = null
let queued = false

function reconcile(resolve: () => Promise<VikunjaSchedule | null>): Promise<void> {
  if (running) {
    queued = true
    return running
  }

  running = (async () => {
    await applySchedule(await resolve())
    while (queued) {
      queued = false
      await applySchedule(await readVikunjaScheduleFromStorage())
    }
  })().finally(() => {
    running = null
  })

  return running
}

/** Brings the alarm in line with what is persisted right now. */
export function ensureAlarm(): Promise<void> {
  return reconcile(readVikunjaScheduleFromStorage)
}

/** Failures no amount of retrying fixes — see `runScheduledPull`. */
function isTerminalFailure(errorKey: VikunjaErrorKey): boolean {
  return errorKey === 'permissionMissing' || errorKey === 'authInvalid'
}

/**
 * One scheduled pull.
 *
 * Failure handling is the interesting part, and it splits on whether waiting
 * would help:
 *
 * - `permissionMissing` / `authInvalid` are the user's to fix — a revoked host
 *   or a dead token. Retrying every minute would never succeed and would keep
 *   sending a token that is already refused, so the alarm is **cleared**. The
 *   next `storage.onChanged` (the user re-connecting) brings it back.
 * - anything else — `network` above all — is transient by nature: a laptop on
 *   a train, a self-hosted instance restarting behind a proxy. The alarm
 *   **stays** and the next period tries again.
 *
 * Either way the failure is broadcast, because the alarm runs while nobody is
 * looking and the widget has no other way to learn about it. A *success* is
 * announced by `pull.ts` instead — it is the read that knows whether anything
 * moved, and it is not only the alarm that reads.
 */
async function runScheduledPull(): Promise<void> {
  const schedule = await readVikunjaScheduleFromStorage()
  if (!schedule) {
    // Configuration disappeared between the alarm being set and it firing.
    await applySchedule(null)
    return
  }

  const { cfg, projectId, viewId } = schedule
  // Forced, because the point of the alarm is to find out whether the remote
  // moved, which a snapshot by definition cannot answer. Unretried, because
  // the alarm is the retry — see the module comment.
  const out = await runPull(cfg, projectId, viewId, { force: true, retry: false })
  if (out.ok) return

  if (isTerminalFailure(out.errorKey)) await clearAlarm()
  broadcastVikunja({
    type: 'vikunja/pull-failed',
    projectId,
    viewId,
    at: Date.now(),
    errorKey: out.errorKey,
  })
}

/**
 * Registers the background pull's listeners and brings the alarm up to date.
 *
 * Called from `src/background/index.ts` at **module top level**, not from
 * `attachListeners()`: an alarm that wakes a cold worker is dispatched right
 * after script evaluation, so a listener added after `await
 * hydratePersistedState()` would miss it. Nothing here needs the boot
 * sequence anyway — every handler reads storage itself.
 *
 * `ensureAlarm()` is fired at the end and deliberately not awaited: this
 * function must return before the first event is dispatched, and creating the
 * alarm can wait a microtask.
 */
export function setupVikunjaPull(): void {
  const api = chromeObject()

  api?.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name !== VIKUNJA_PULL_ALARM) return
    void runScheduledPull().catch((err: unknown) => {
      console.error('[vikunja] scheduled pull failed', {
        error: err instanceof Error ? err.name : 'unknown',
      })
    })
  })

  api?.storage?.onChanged?.addListener((changes, area) => {
    // `local` only: the Todo envelope lives there whenever an integration is
    // connected (secrets never reach `sync`), so a `sync` change cannot be
    // about a Vikunja schedule.
    if (area !== 'local') return
    const change = changes[VIKUNJA_TODO_STORAGE_KEY]
    if (!change) return

    // The event carries the envelope, so a removal (`newValue` absent) and a
    // write are the same code path — `readVikunjaScheduleFrom` answers `null`
    // for the first, which clears up.
    void reconcile(async () => readVikunjaScheduleFrom(change.newValue)).catch((err: unknown) => {
      console.error('[vikunja] pull alarm sync failed', {
        error: err instanceof Error ? err.name : 'unknown',
      })
    })
  })

  void ensureAlarm().catch((err: unknown) => {
    console.error('[vikunja] pull alarm init failed', {
      error: err instanceof Error ? err.name : 'unknown',
    })
  })
}
