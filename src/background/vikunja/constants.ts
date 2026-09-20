/**
 * Worker-side Vikunja constants. Everything tied to the protocol (paths,
 * timings, magic strings on the wire) lives here so `client.ts` stays
 * readable and the numbers are testable by import rather than by literal.
 *
 * Tasks 5–7 add the pagination and mapping constants next to these.
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
