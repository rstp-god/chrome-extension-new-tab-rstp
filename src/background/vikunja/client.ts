/**
 * The **only** module in the project that talks to a Vikunja instance over
 * the network.
 *
 * It lives in the service worker because Vikunja answers a preflight from a
 * `chrome-extension://` origin with no `Access-Control-*` header at all
 * (recon Q17), so the New Tab page can never fetch it directly. The widget
 * reaches this class through `messages.ts` only.
 *
 * Logging rule: the token, the instance URL and every response body are
 * secrets here. Only a path template plus a status code may be logged.
 */

import {
  VIKUNJA_API_PREFIX,
  VIKUNJA_BACKOFF_MS,
  VIKUNJA_OP_DEADLINE_MS,
  VIKUNJA_REQUEST_TIMEOUT_MS,
} from '@/background/vikunja/constants.ts'
import { vikunjaInfoSchema, vikunjaUserSchema } from '@/background/vikunja/schema.ts'

import type { VikunjaErrorKey, VikunjaResponse } from '@/background/vikunja/messages.ts'
import type { VikunjaInfo, VikunjaUser } from '@/background/vikunja/schema.ts'
import type { z } from 'zod'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * One round trip's verdict: either the final answer, or "the server is
 * having a moment, try again".
 */
type Attempt<T> = { retry: false; response: VikunjaResponse<T> } | { retry: true; status: number }

const NETWORK_FAILURE: VikunjaResponse<never> = { ok: false, errorKey: 'network' }
const UNKNOWN_FAILURE: VikunjaResponse<never> = { ok: false, errorKey: 'unknown' }

/**
 * Maps a non-5xx status onto an error key, or `null` when the response is a
 * success. 400 lands in `unknown` on purpose: a rejected body is our bug, not
 * something the user can fix by re-entering credentials.
 */
function statusToErrorKey(status: number): VikunjaErrorKey | null {
  if (status >= 200 && status < 300) return null
  if (status === 401 || status === 403) return 'authInvalid'
  if (status === 404) return 'notFound'
  if (status === 429) return 'rateLimited'
  return 'unknown'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class VikunjaClient {
  private readonly apiBase: string

  /**
   * @param baseUrl instance root, already normalised by `vikunjaWireSchema`
   *   (https, no trailing slash, no `/api/v1`)
   * @param token personal API token — header-only, never a query parameter
   */
  constructor(
    baseUrl: string,
    private readonly token: string,
  ) {
    this.apiBase = `${baseUrl}${VIKUNJA_API_PREFIX}`
  }

  // ---------- public surface ----------

  /** `GET /info` — unauthenticated on most instances, but cheap and versioned. */
  getInfo(): Promise<VikunjaResponse<VikunjaInfo>> {
    return this.get('/info', vikunjaInfoSchema)
  }

  /** `GET /user` — the first call that actually proves the token works. */
  getCurrentUser(): Promise<VikunjaResponse<VikunjaUser>> {
    return this.get('/user', vikunjaUserSchema)
  }

  // ---------- internals ----------

  /**
   * The only verb wired up so far. `request` below already takes a method and
   * a body, so the `post` / `put` / `delete` wrappers are a line each — they
   * arrive with the ops that need them (tasks 5–6) rather than sitting here
   * unused, which `noUnusedLocals` would reject anyway.
   */
  private get<S extends z.ZodType>(path: string, schema: S): Promise<VikunjaResponse<z.infer<S>>> {
    return this.request('GET', path, schema)
  }

  /**
   * Runs one request, retrying only a 5xx and only on the documented
   * schedule. Every other outcome — including a thrown fetch and a timeout —
   * is final: DNS failures and rejected bodies do not improve with waiting.
   */
  private async request<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<VikunjaResponse<z.infer<S>>> {
    const startedAt = Date.now()

    for (let attempt = 0; ; attempt += 1) {
      const outcome = await this.attempt(method, path, schema, body)
      if (!outcome.retry) return outcome.response
      if (attempt >= VIKUNJA_BACKOFF_MS.length) return NETWORK_FAILURE

      // Slow attempts eat the budget too, so the decision is made on the
      // clock rather than on the retry count alone: a wait that would push
      // the operation past its deadline is not worth starting.
      const wait = VIKUNJA_BACKOFF_MS[attempt]
      if (Date.now() - startedAt + wait > VIKUNJA_OP_DEADLINE_MS) return NETWORK_FAILURE

      // Path template + status only: the base URL identifies the user's
      // private instance and the body may echo task contents.
      console.warn('[vikunja] server error, retrying', {
        path,
        status: outcome.status,
        attempt: attempt + 1,
      })
      await delay(wait)
    }
  }

  private async attempt<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    schema: S,
    body: unknown,
  ): Promise<Attempt<z.infer<S>>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), VIKUNJA_REQUEST_TIMEOUT_MS)
    try {
      return await this.exchange(controller.signal, method, path, schema, body)
    } finally {
      clearTimeout(timer)
    }
  }

  private async exchange<S extends z.ZodType>(
    signal: AbortSignal,
    method: HttpMethod,
    path: string,
    schema: S,
    body: unknown,
  ): Promise<Attempt<z.infer<S>>> {
    const hasBody = body !== undefined

    let res: Response
    try {
      res = await fetch(`${this.apiBase}${path}`, {
        method,
        headers: this.headers(hasBody),
        body: hasBody ? JSON.stringify(body) : undefined,
        signal,
        // A redirect off the host the user granted would send the bearer
        // token somewhere they never approved — refuse instead of following.
        redirect: 'error',
        // The token is the only credential; never attach cookies.
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch {
      // Thrown fetch covers DNS, TLS, a refused redirect and our own abort.
      // The error message can embed the instance URL, so it is not logged.
      return { retry: false, response: NETWORK_FAILURE }
    }

    if (res.status >= 500) return { retry: true, status: res.status }

    const errorKey = statusToErrorKey(res.status)
    if (errorKey) return { retry: false, response: { ok: false, errorKey } }

    let json: unknown
    try {
      json = await res.json()
    } catch {
      // The body can hang after the headers land, and the timeout fires into
      // the middle of this read. That is a transport failure, not a malformed
      // payload, so it must not be reported as `unknown`.
      return { retry: false, response: signal.aborted ? NETWORK_FAILURE : UNKNOWN_FAILURE }
    }

    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      // Issue paths would name fields of the user's data — status only.
      console.warn('[vikunja] response did not match the schema', { path, status: res.status })
      return { retry: false, response: UNKNOWN_FAILURE }
    }
    return { retry: false, response: { ok: true, value: parsed.data } }
  }

  private headers(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    }
    if (hasBody) headers['Content-Type'] = 'application/json'
    return headers
  }
}
