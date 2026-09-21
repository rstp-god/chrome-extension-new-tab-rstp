/**
 * The background half of the Vikunja integration: a periodic `chrome.alarms`
 * job that pulls every connected view so the widget finds out about a task
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
 * wake-ups, so the schedule — the credentials, the period, and the list of
 * boards — is parsed out of the Todo widget's envelope on every alarm, with a
 * minimal schema of its own, because the worker may not import the widget's
 * (boundary rule in `messages.ts`).
 *
 * **One alarm, every board.** `chrome.alarms` gives a name and a period, not
 * a payload, so the tick cannot be told which board woke it; it walks the
 * whole list instead. See `VikunjaSchedule` for why that beats an alarm per
 * board. A tick is therefore several sequential reads long, and MV3 may
 * unload the worker part-way through one: the boards not yet reached are
 * simply not read until the next period. Nothing is left inconsistent by it —
 * each board's snapshot is written whole, before the next board is started,
 * and the delta is always computed against whatever snapshot is actually
 * there.
 *
 * Note what is *not* here: the `vikunja/pulled` broadcast. Every real read
 * announces itself from `pull.ts`, whichever caller started it, so a manual
 * sync in one tab reaches the others too. The alarm only owns the failures,
 * which nobody else is in a position to notice.
 */

import { z } from 'zod'

import { broadcastVikunja, swallowRejection } from '@/background/vikunja/broadcast.ts'
import { clearSnapshots, pruneSnapshots, snapshotHost } from '@/background/vikunja/cache.ts'
import {
  VIKUNJA_PULL_ALARM,
  VIKUNJA_PULL_PERIOD_MIN,
  VIKUNJA_PULL_PERIODS_MIN,
  VIKUNJA_TODO_STORAGE_KEY,
} from '@/background/vikunja/constants.ts'
import { runPull } from '@/background/vikunja/pull.ts'

import type {
  VikunjaDeltaCounts,
  VikunjaErrorKey,
  VikunjaPullPeriod,
  VikunjaWire,
} from '@/background/vikunja/messages.ts'

/** One board the tick reads, as Vikunja addresses a task list. */
export interface VikunjaScheduledBoard {
  projectId: number
  viewId: number
}

/**
 * Everything the alarm needs to do its job, read out of storage.
 *
 * **One period, a list of boards.** There is a single alarm per instance and
 * it cannot say which board woke it, so the tick walks every connected board
 * instead — which is also the only shape that keeps the period the user
 * picked meaning what it says: three alarms would be three times the traffic,
 * and dividing the period between the boards would make "every 5 minutes"
 * depend on how many boards they happen to have connected.
 *
 * Never empty: `readVikunjaScheduleFrom` answers `null` rather than a
 * schedule with nothing to read.
 */
export interface VikunjaSchedule {
  cfg: VikunjaWire
  boards: VikunjaScheduledBoard[]
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
 * One board, with only its presence checked for the mapping: `null` until the
 * wizard is done, and **one such board pauses the whole schedule** (see
 * `readVikunjaScheduleFrom`).
 *
 * The mapping's *contents* are deliberately not modelled — `bucket id →
 * status` is the widget's business, and the worker only ever asks whether
 * there is one.
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
 * wizard the user has not finished for every board.
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
    // **Every board, in stored order** — and deliberately not "the default
    // one": which board is the default is a statement about the settings UI,
    // while a board left unpulled is a board whose tasks silently go stale.
    const boards = config.boards.map((board) => ({
      projectId: board.projectId,
      viewId: board.viewId,
    }))
    // No board at all, or **any** board whose wizard is unfinished: nothing
    // to wake up for.
    //
    // The second half deliberately mirrors the page rather than doing as much
    // as it can. The widget refuses to sync at all while one board is
    // unmapped (`getSetupStep` answers `'mapping'` and keeps the user in the
    // wizard), so pulling the mapped boards meanwhile would spend requests on
    // someone's own server and write snapshots no page is going to read. One
    // rule on both sides, and the pull resumes the moment the wizard is done —
    // finishing it writes the envelope, which is the event that reconciles
    // the alarm.
    if (boards.length === 0) return null
    if (config.boards.some((board) => board.mapping === null)) return null

    return {
      cfg: { baseUrl: config.baseUrl, token: config.token },
      boards,
      periodMin: resolvePeriod(config.pullPeriodMin),
    }
  }

  // Bytes written by the single-board build, still on disk until the page
  // that upgraded them writes them back — see the schema comment above. It
  // yields one board, so the tick takes the same path for both records.
  const legacy = legacyEnvelopeSchema.safeParse(raw)
  if (!legacy.success) return null

  const { config, mapping } = legacy.data.state.integration
  if (mapping === null) return null

  return {
    cfg: { baseUrl: config.baseUrl, token: config.token },
    boards: [{ projectId: config.projectId, viewId: config.viewId }],
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
/**
 * The board set the snapshots were last swept for, as a string.
 *
 * Reconciliation runs on every `storage.onChanged`, which means on every task
 * the user ticks off — and a sweep costs a key listing, which on a Chrome
 * without `storage.getKeys()` is a full read of everything the extension has
 * stored. Remembering what was already swept turns that into once per
 * distinct board set per worker lifetime: the edits in between are free, and
 * a board added, removed or re-pointed changes the signature and sweeps
 * again. Worker-scoped like everything else here; a cold start sweeps once,
 * which is also what catches a board removed while the worker was asleep.
 */
let lastPrunedSignature: string | null = null

function scheduleSignature(schedule: VikunjaSchedule): string {
  const host = snapshotHost(schedule.cfg.baseUrl)
  return `${host}|${schedule.boards.map((board) => `${board.projectId}:${board.viewId}`).join(',')}`
}

async function applySchedule(schedule: VikunjaSchedule | null): Promise<void> {
  const existing = await getExistingAlarm()

  if (!schedule) {
    // Not merely "no schedule" but the transition into it: the disconnect
    // path (`clearIntegration` wipes the local envelope) is the only way an
    // alarm and its snapshots become garbage.
    if (!existing) return
    await clearAlarm()
    await clearSnapshots()
    // Everything is gone, so the next connection sweeps again rather than
    // trusting a signature about a config that no longer exists.
    lastPrunedSignature = null
    return
  }

  // A board removed, or re-pointed at another view: its snapshot is keyed by
  // a pair the schedule no longer names, and nothing else will ever
  // invalidate it. Scoped to this instance's host, so a key belonging to
  // another server is left for `clearSnapshots`.
  const signature = scheduleSignature(schedule)
  if (signature !== lastPrunedSignature) {
    await pruneSnapshots(snapshotHost(schedule.cfg.baseUrl), schedule.boards)
    lastPrunedSignature = signature
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
 * One scheduled tick: every connected board, read one after the other.
 *
 * Failure handling is the interesting part, and it splits on whether waiting
 * would help — and, now that a tick covers several boards, on whether the
 * failure is about the board or about the connection:
 *
 * - `permissionMissing` / `authInvalid` are the user's to fix, and they are
 *   properties of the **connection**: a revoked host or a dead token. The
 *   next board would send the very same refused token to the very same
 *   withdrawn origin, so the tick **stops** and the alarm is **cleared**;
 *   retrying every minute would never succeed and would keep sending a token
 *   that is already refused. The next `storage.onChanged` (the user
 *   re-connecting) brings the alarm back.
 * - anything else — `network` above all — is transient by nature and may well
 *   be about that one board (a project deleted remotely answers `notFound`
 *   while the rest of the instance is fine). Its failure is broadcast and the
 *   tick **carries on with the next board**; the alarm stays, and the next
 *   period tries again.
 *
 * Either way the failure is broadcast, because the alarm runs while nobody is
 * looking and the widget has no other way to learn about it. A *success* is
 * announced by `pull.ts` instead — it is the read that knows whether anything
 * moved, and it is not only the alarm that reads.
 *
 * Sequential on purpose: this is somebody's own server, and a pull is already
 * one request per page of every bucket of a view.
 */
async function runScheduledPull(): Promise<void> {
  const schedule = await readVikunjaScheduleFromStorage()
  if (!schedule) {
    // Configuration disappeared between the alarm being set and it firing.
    await applySchedule(null)
    return
  }

  const { cfg, boards } = schedule
  const totals: VikunjaDeltaCounts = { added: 0, changed: 0, removed: 0 }
  // The board the single `vikunja/pulled` is addressed to — see `announceTick`.
  let firstChanged: VikunjaScheduledBoard | null = null

  for (const { projectId, viewId } of boards) {
    // Forced, because the point of the alarm is to find out whether the
    // remote moved, which a snapshot by definition cannot answer. Unretried,
    // because the alarm is the retry — see the module comment. Unannounced,
    // because the tick speaks once, at the end.
    const out = await runPull(cfg, projectId, viewId, {
      force: true,
      retry: false,
      announce: false,
      boardCount: boards.length,
    })

    if (out.ok) {
      if (out.value.announceable) {
        firstChanged ??= { projectId, viewId }
        totals.added += out.value.delta.added.length
        totals.changed += out.value.delta.changed.length
        totals.removed += out.value.delta.removed.length
      }
      continue
    }

    const terminal = isTerminalFailure(out.errorKey)
    if (terminal) await clearAlarm()
    // Failures stay **per board**: which board is unreachable is the whole
    // content of the message, and a page shows it as that board's state.
    broadcastVikunja({
      type: 'vikunja/pull-failed',
      projectId,
      viewId,
      at: Date.now(),
      errorKey: out.errorKey,
    })
    if (terminal) break
  }

  // Even after a terminal stop: the boards read before it really did move,
  // and the pages are entitled to what was already found.
  announceTick(firstChanged, totals)
}

/**
 * One `vikunja/pulled` for the whole tick, or none when nothing moved.
 *
 * Addressed to the **first board that changed**, and that is enough by
 * design: a page accepts a broadcast about any board it syncs
 * (`subscribe.ts`) and answers it with one silent sync of *all* of them,
 * served from the snapshots this tick just wrote. Naming every changed board
 * would widen the broadcast shape for information no receiver reads. The
 * counts are the tick's totals, so "something moved, and roughly how much"
 * stays true across the loop.
 */
function announceTick(board: VikunjaScheduledBoard | null, delta: VikunjaDeltaCounts): void {
  if (!board) return

  broadcastVikunja({
    type: 'vikunja/pulled',
    projectId: board.projectId,
    viewId: board.viewId,
    at: Date.now(),
    delta,
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
