/**
 * Worker-side Vikunja constants. Everything tied to the protocol (paths,
 * timings, magic strings on the wire) lives here so `client.ts` stays
 * readable and the numbers are testable by import rather than by literal.
 *
 * Numbers both sides of the bridge need (the pull periods, the push
 * concurrency) live in `messages.ts` instead and are re-exported at the
 * bottom of this file — nothing under `src/widgets/` may import this one.
 */

/** Versioned REST root, appended to the user's normalised base URL. */
export const VIKUNJA_API_PREFIX = '/api/v1'

/**
 * Hard ceiling on a single request. A self-hosted instance behind a dead
 * tunnel answers neither body nor error, and the service worker would sit on
 * the promise until Chrome unloads it; abort and report `network` instead.
 */
export const VIKUNJA_REQUEST_TIMEOUT_MS = 20_000

/**
 * Wall-clock ceiling for **one request and its retries**, backoff waits
 * included — not for a logical operation, which may be several requests
 * (`getViewTasks` reads a page at a time, `updateTask` reads before it
 * writes) and is therefore bounded by this many milliseconds *per request*.
 *
 * `VIKUNJA_REQUEST_TIMEOUT_MS` bounds a single round trip, which is not the
 * same thing: four slow-but-not-hung attempts plus 17 s of backoff could
 * otherwise keep one request going for over a minute, long enough for MV3 to
 * unload the worker mid-flight. A retry that would cross this line is skipped
 * and the request reports `network`.
 */
export const VIKUNJA_OP_DEADLINE_MS = 45_000

/**
 * Delays before retry #1, #2 and #3 of a 5xx. A self-hosted instance
 * restarting behind a reverse proxy answers 502 for a few seconds, so the
 * first retry is deliberately quick and the last one long enough to outlive
 * a container restart. The original attempt is not counted here: a request
 * that keeps failing is tried `1 + VIKUNJA_BACKOFF_MS.length` times before
 * the client gives up with `network`.
 *
 * Only 5xx is retried. A 4xx is the server's considered answer and a thrown
 * fetch is usually DNS or a dead tunnel — neither gets better by waiting.
 */
export const VIKUNJA_BACKOFF_MS = [1000, 4000, 12_000] as const

/**
 * `GET /info` reports `max_items_per_page: 50` (recon Q15), and asking for
 * more is silently clamped to it — so 50 is both the ceiling and the only
 * page size worth sending.
 */
export const VIKUNJA_PAGE_SIZE = 50

/**
 * Hard ceiling on how many pages one paged read may fetch.
 *
 * The kanban view endpoint paginates **per bucket** and its
 * `x-pagination-total-pages` header counts buckets rather than tasks (recon
 * Q15), so the only honest stop condition is "no bucket returned a full
 * page". That condition depends on the instance answering consistently; a
 * server that keeps handing back 50 tasks per bucket forever would otherwise
 * spin the worker until MV3 unloads it. 40 pages is 2000 tasks per bucket —
 * far past any real board, and still a bounded number of round trips.
 */
export const VIKUNJA_MAX_PULL_PAGES = 40

/**
 * Name of the periodic `chrome.alarms` job that pulls the configured view in
 * the background. One alarm for the whole feature: the widget holds at most
 * one active integration, so a second name could only ever be a leak.
 */
export const VIKUNJA_PULL_ALARM = 'vikunja-pull'

/**
 * How long a snapshot counts as fresh enough to answer a non-forced pull
 * without touching the network.
 *
 * This is what makes the broadcast cheap: the alarm reads every connected
 * view, writes their snapshots and tells the pages once; each page then runs
 * its own sync, which reads *all* of its boards here and is served from those
 * very snapshots. A window shorter than the tick that produced them would
 * defeat it, and a long one would make a user-triggered sync stale — but a
 * user-triggered sync is forced and never reaches this check.
 *
 * A minute rather than the original 15 s because the tick is now a loop: the
 * first board's snapshot is already several sequential reads old by the time
 * the last board is done and the broadcast goes out, and a self-hosted
 * instance answering a paged view read in a few seconds per board is
 * ordinary. Too short a window and the woken pages re-read the early boards
 * over the network — exactly the per-tab storm the snapshot exists to
 * prevent.
 */
export const VIKUNJA_SNAPSHOT_FRESH_MS = 60_000

/**
 * Ceiling on how many tasks one snapshot may hold.
 *
 * `chrome.storage.local`'s quota is shared by every widget, and a snapshot is
 * written on every background pull. Title and description are already
 * truncated at the edge (`VIKUNJA_MAX_TITLE_LENGTH` /
 * `VIKUNJA_MAX_DESCRIPTION_LENGTH`), so the remaining unbounded dimension is
 * the task count. 2000 is far past any board a person reads in a widget, and
 * the delta a truncated snapshot produces is wrong only about tasks the
 * widget was never going to show.
 */
export const VIKUNJA_SNAPSHOT_MAX_TASKS = 2000

/**
 * Ceiling on the serialised size of one snapshot.
 *
 * The count cap above is not enough on its own: a description is rich text
 * bounded at 16 KiB, so 2000 tasks is a theoretical 32 MB record — far past
 * `chrome.storage.local`'s quota, which every widget shares. Both dimensions
 * are therefore bounded: `writeSnapshot` applies the count cap first and then
 * drops trailing tasks until the JSON fits in this budget.
 *
 * 1.5 MB is generous for a board a person reads in a widget and small enough
 * that a pathological one cannot squeeze the other widgets out of storage.
 *
 * It is a **per-board** ceiling; `VIKUNJA_SNAPSHOT_TOTAL_MAX_BYTES` below is
 * what stops a connection with many boards from multiplying it.
 */
export const VIKUNJA_SNAPSHOT_MAX_BYTES = 1_500_000

/**
 * Ceiling on every snapshot of one connection put together.
 *
 * The per-board cap alone stopped meaning anything once a tick reads every
 * board: ten boards at 1.5 MB each is 15 MB of `chrome.storage.local`, a
 * quota every widget in the extension shares. So the effective per-board
 * budget is `min(VIKUNJA_SNAPSHOT_MAX_BYTES, floor(total / boards))` — one
 * board still gets its full 1.5 MB, and a connection with many boards divides
 * this between them instead of each taking the maximum.
 *
 * 4 MB leaves the per-board cap untouched for the one, two or three boards
 * almost everyone has (3 × 1.33 MB), and only starts biting past that — which
 * is the point at which "every board keeps a full copy of its task list" is
 * the thing worth bounding.
 */
export const VIKUNJA_SNAPSHOT_TOTAL_MAX_BYTES = 4_000_000

/**
 * The Todo widget's envelope key in `chrome.storage.local`.
 *
 * Spelled out here rather than imported from `src/widgets/Todo/store/store.ts`:
 * the worker must not import widget code (see the boundary rule in
 * `messages.ts`), and the alarm has no other way to learn which project to
 * pull — the worker keeps no state between wake-ups.
 * `tests/extension/vikunjaBridge.spec.ts` writes that key and asserts the
 * alarm appears, which is what keeps this literal honest.
 */
export const VIKUNJA_TODO_STORAGE_KEY = 'todo-widget:v1'

/**
 * Re-exported so the worker has one constants surface: both numbers are
 * shared vocabulary and live in `messages.ts` (the widget needs them too, and
 * nothing under `src/widgets/` may import this file).
 */
export {
  VIKUNJA_MUTATION_CONCURRENCY,
  VIKUNJA_PULL_PERIOD_MIN,
  VIKUNJA_PULL_PERIODS_MIN,
} from '@/background/vikunja/messages.ts'
