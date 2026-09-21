/**
 * The background half of the Vikunja integration: a periodic `chrome.alarms`
 * job that pulls the configured view and tells the open New Tab pages what
 * moved.
 *
 * Three constraints shape everything here.
 *
 * **`chrome.alarms`, never a timer.** MV3 unloads the service worker after
 * ~30 s of idle, taking every `setInterval` with it. An alarm survives that,
 * which is the only reason a "background pull" can exist at all.
 *
 * **Listeners register synchronously, at module scope** (see
 * `setupVikunjaPull` and the comment in `src/background/index.ts`). The event
 * that woke a cold worker is dispatched as soon as the script finishes
 * evaluating, so a listener attached behind an `await` misses the very alarm
 * that started the worker — and the next one is a whole period away.
 *
 * **The worker has no config but storage.** It keeps nothing between
 * wake-ups, so the schedule is re-read from the Todo widget's envelope on
 * every alarm — with a minimal schema of its own, because the worker may not
 * import the widget's (boundary rule in `messages.ts`).
 */

import { z } from 'zod'

import { clearSnapshots } from '@/background/vikunja/cache.ts'
import {
  VIKUNJA_PULL_ALARM,
  VIKUNJA_PULL_PERIOD_MIN,
  VIKUNJA_PULL_PERIODS_MIN,
  VIKUNJA_TODO_STORAGE_KEY,
} from '@/background/vikunja/constants.ts'
import { isEmptyDelta, runPull } from '@/background/vikunja/pull.ts'

import type {
  VikunjaBroadcast,
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
 * The worker's minimal view of the Todo envelope: the active integration's
 * credentials, the scope, and whether the user finished the mapping wizard.
 *
 * Deliberately not the widget's `todoEnvelopeSchema` — the worker must not
 * import widget code — and deliberately *narrower* than it: this schema is
 * not a data-loss contract, it is a question ("is there a Vikunja view to
 * pull, and how often"). So it reads the five fields that answer it and
 * ignores the tasks, the cached buckets and everything else the widget keeps.
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
const scheduleEnvelopeSchema = z.object({
  state: z.object({
    integration: z.object({
      name: z.literal('vikunja'),
      config: z.object({
        baseUrl: z.string().max(2048),
        token: z.string().min(1).max(4096),
        projectId: z.number().int().positive(),
        viewId: z.number().int().positive(),
        pullPeriodMin: z.number().optional(),
      }),
      // Only its presence matters: a widget that has not mapped its buckets
      // has nowhere to put a pulled task, so pulling for it would be work
      // nobody can use. `null` until the wizard is done.
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
 * The schedule the persisted state currently asks for, or `null` when there
 * is nothing to pull: no integration, a different backend, half a scope, or a
 * mapping the user never finished.
 *
 * `null` is not an error — it is the normal answer for a widget with no
 * Vikunja connected, and it is what tells `ensureAlarm` to clean up.
 */
export async function readVikunjaScheduleFromStorage(): Promise<VikunjaSchedule | null> {
  const local = chromeObject()?.storage?.local
  if (!local) return null

  let raw: unknown
  try {
    const items = await local.get(VIKUNJA_TODO_STORAGE_KEY)
    raw = items[VIKUNJA_TODO_STORAGE_KEY]
  } catch {
    // Storage unreadable: treat as "nothing scheduled" rather than throwing
    // inside an alarm handler, where there is nobody to catch it.
    return null
  }

  if (raw === undefined) return null

  const parsed = scheduleEnvelopeSchema.safeParse(raw)
  if (!parsed.success) return null

  const { config, mapping } = parsed.data.state.integration
  if (mapping === null) return null

  return {
    cfg: { baseUrl: config.baseUrl, token: config.token },
    projectId: config.projectId,
    viewId: config.viewId,
    periodMin: resolvePeriod(config.pullPeriodMin),
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
 * Brings the alarm in line with what is persisted.
 *
 * Re-created only when the period actually differs: `chrome.alarms.create`
 * with an existing name replaces the alarm and restarts its interval, so
 * calling it unconditionally on every `storage.onChanged` — which fires for
 * every task the user ticks off — would keep pushing the next pull away and
 * a busy widget would never pull at all.
 *
 * With nothing scheduled the alarm goes *and* the snapshots go with it: the
 * cached task list of a project nobody is linked to any more is stale data
 * with no one left to invalidate it. That is the disconnect path —
 * `clearIntegration` wipes the local envelope, `storage.onChanged` brings us
 * here, and the feature leaves no trace behind.
 */
export async function ensureAlarm(): Promise<void> {
  const schedule = await readVikunjaScheduleFromStorage()

  if (!schedule) {
    await clearAlarm()
    await clearSnapshots()
    return
  }

  const existing = await getExistingAlarm()
  if (existing && existing.periodInMinutes === schedule.periodMin) return

  const alarms = chromeObject()?.alarms
  if (!alarms?.create) return
  try {
    alarms.create(VIKUNJA_PULL_ALARM, { periodInMinutes: schedule.periodMin })
  } catch (err) {
    console.warn('[vikunja] pull alarm create failed', {
      error: err instanceof Error ? err.name : 'unknown',
    })
  }
}

/**
 * Tells whoever is listening, and shrugs when nobody is.
 *
 * "Receiving end does not exist" is the *normal* case here: the alarm fires
 * whether or not a New Tab page is open, and with no page there is no
 * listener. Swallowing it silently is the point — an unhandled rejection in
 * the worker would be logged on every pull of a browser whose owner has no
 * new tab open.
 */
function broadcast(message: VikunjaBroadcast): void {
  const runtime = chromeObject()?.runtime
  if (!runtime?.sendMessage) return

  try {
    const sent: unknown = runtime.sendMessage(message)
    if (sent && typeof (sent as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(sent).catch(() => {
        // No page listening, or it went away mid-send.
      })
    }
  } catch {
    // Synchronous throw from `sendMessage` (no receivers at all).
  }
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
 * looking and the widget has no other way to learn about it.
 *
 * A success only broadcasts when something actually moved; a quiet board must
 * not wake every open tab into a sync every period.
 */
async function runScheduledPull(): Promise<void> {
  const schedule = await readVikunjaScheduleFromStorage()
  if (!schedule) {
    // Configuration disappeared between the alarm being set and it firing.
    await clearAlarm()
    await clearSnapshots()
    return
  }

  const { cfg, projectId, viewId } = schedule
  // Always forced: the point of the alarm is to find out whether the remote
  // moved, which a snapshot by definition cannot answer.
  const out = await runPull(cfg, projectId, viewId, { force: true })

  if (!out.ok) {
    if (isTerminalFailure(out.errorKey)) await clearAlarm()
    broadcast({
      type: 'vikunja/pull-failed',
      projectId,
      viewId,
      at: Date.now(),
      errorKey: out.errorKey,
    })
    return
  }

  if (isEmptyDelta(out.value.delta)) return

  broadcast({
    type: 'vikunja/pulled',
    projectId,
    viewId,
    at: out.value.pulledAt,
    delta: out.value.delta,
  })
}

/** Failures no amount of retrying fixes — see `runScheduledPull`. */
function isTerminalFailure(errorKey: VikunjaErrorKey): boolean {
  return errorKey === 'permissionMissing' || errorKey === 'authInvalid'
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
    if (!Object.prototype.hasOwnProperty.call(changes, VIKUNJA_TODO_STORAGE_KEY)) return

    // One path for a change and for a removal: `ensureAlarm` re-reads storage
    // and a missing key answers "nothing scheduled", which clears up.
    void ensureAlarm().catch((err: unknown) => {
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
