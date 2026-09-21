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

import { z } from 'zod'

import {
  VIKUNJA_API_PREFIX,
  VIKUNJA_BACKOFF_MS,
  VIKUNJA_MAX_PULL_PAGES,
  VIKUNJA_OP_DEADLINE_MS,
  VIKUNJA_PAGE_SIZE,
  VIKUNJA_REQUEST_TIMEOUT_MS,
} from '@/background/vikunja/constants.ts'
import {
  vikunjaBucketSchema,
  vikunjaBucketWithTasksSchema,
  vikunjaInfoSchema,
  vikunjaLabelSchema,
  vikunjaProjectSchema,
  vikunjaUserSchema,
  vikunjaViewSchema,
} from '@/background/vikunja/schema.ts'

import type { VikunjaErrorKey, VikunjaResponse } from '@/background/vikunja/messages.ts'
import type {
  VikunjaBucket,
  VikunjaBucketWithTasks,
  VikunjaInfo,
  VikunjaLabel,
  VikunjaProject,
  VikunjaUser,
  VikunjaView,
} from '@/background/vikunja/schema.ts'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * A parsed body plus the response headers it arrived with. Pagination lives
 * in the headers (`x-pagination-total-pages`), and only the client is allowed
 * to know that — so the headers travel no further than this file.
 */
interface WithHeaders<T> {
  value: T
  headers: Headers
}

/**
 * One round trip's verdict: either the final answer, or "the server is
 * having a moment, try again".
 */
type Attempt<T> = { retry: false; response: VikunjaResponse<T> } | { retry: true; status: number }

/**
 * `x-pagination-total-pages`, or `null` when the header is missing or not a
 * usable count. On the kanban view endpoint it counts *buckets* rather than
 * pages of tasks (recon Q15), which is why `getViewTasks` below ignores it
 * and stops on a short page instead.
 */
function totalPages(headers: Headers): number | null {
  const raw = headers.get('x-pagination-total-pages')
  if (raw === null) return null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

/**
 * The cap is a safety valve, not a normal outcome: hitting it means the read
 * is incomplete and the user is quietly seeing a truncated board. Path
 * template only — never the host or the body.
 */
function warnPageCap(path: string): void {
  console.warn('[vikunja] page cap reached', { path })
}

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

  /**
   * Every project the token can see, archived ones included — the adapter
   * decides what to hide, because "archived" is a presentation rule and this
   * layer only transports.
   */
  getProjects(): Promise<VikunjaResponse<VikunjaProject[]>> {
    return this.getAllPages('/projects', vikunjaProjectSchema)
  }

  /** One view, for its `done_bucket_id` / `default_bucket_id`. */
  getView(projectId: number, viewId: number): Promise<VikunjaResponse<VikunjaView>> {
    return this.get(this.viewPath(projectId, viewId), vikunjaViewSchema)
  }

  /** The kanban columns of a view, in board order. */
  getBuckets(projectId: number, viewId: number): Promise<VikunjaResponse<VikunjaBucket[]>> {
    return this.get(`${this.viewPath(projectId, viewId)}/buckets`, z.array(vikunjaBucketSchema))
  }

  /** Every label on the instance; labels are global, not per project. */
  getLabels(): Promise<VikunjaResponse<VikunjaLabel[]>> {
    return this.getAllPages('/labels', vikunjaLabelSchema)
  }

  /**
   * The full contents of a kanban view: every bucket with every one of its
   * tasks.
   *
   * This endpoint is the only place a task's `bucket_id` is correct (recon
   * Q3) and it already includes done tasks (recon Q6), so one paged read is
   * the whole pull.
   *
   * Pagination is the awkward part. `per_page` applies **per bucket** and
   * `x-pagination-total-pages` counts buckets, so the header cannot say when
   * we are done (recon Q15). The loop therefore keeps going while at least
   * one bucket came back with a full page of tasks, and gives up at
   * `VIKUNJA_MAX_PULL_PAGES` rather than trusting the instance to ever
   * return a short page.
   */
  async getViewTasks(
    projectId: number,
    viewId: number,
  ): Promise<VikunjaResponse<VikunjaBucketWithTasks[]>> {
    const schema = z.array(vikunjaBucketWithTasksSchema)
    const path = `${this.viewPath(projectId, viewId)}/tasks`

    // Insertion-ordered, so the merged result keeps the board's own column
    // order however many pages it took to read.
    const merged = new Map<number, VikunjaBucketWithTasks>()
    // A task belongs to exactly one bucket, so one id set covers them all and
    // a page boundary cannot duplicate a task into the pull.
    const seen = new Set<number>()

    for (let page = 1; page <= VIKUNJA_MAX_PULL_PAGES; page += 1) {
      const out = await this.get(`${path}?per_page=${VIKUNJA_PAGE_SIZE}&page=${page}`, schema)
      if (!out.ok) return out

      let sawFullBucket = false
      for (const bucket of out.value) {
        const incoming = bucket.tasks ?? []
        if (incoming.length >= VIKUNJA_PAGE_SIZE) sawFullBucket = true

        const known = merged.get(bucket.id)
        const target = known ?? { ...bucket, tasks: [] }
        if (!known) merged.set(bucket.id, target)

        for (const task of incoming) {
          if (seen.has(task.id)) continue
          seen.add(task.id)
          target.tasks?.push(task)
        }
      }

      if (!sawFullBucket) break
      if (page === VIKUNJA_MAX_PULL_PAGES) warnPageCap(path)
    }

    return { ok: true, value: [...merged.values()] }
  }

  /**
   * Creates a column. `PUT` is Vikunja's verb for "create" here (recon Q12);
   * the token needs the `views_buckets_put` scope or this answers 403 →
   * `authInvalid`.
   */
  createBucket(
    projectId: number,
    viewId: number,
    title: string,
  ): Promise<VikunjaResponse<VikunjaBucket>> {
    return this.put(`${this.viewPath(projectId, viewId)}/buckets`, vikunjaBucketSchema, { title })
  }

  // ---------- internals ----------

  /**
   * Ids are numbers validated by the handler before they reach this class, so
   * they need no escaping — but they are built in one place anyway so a typo
   * in a path cannot differ between two methods.
   */
  private viewPath(projectId: number, viewId: number): string {
    return `/projects/${projectId}/views/${viewId}`
  }

  private get<S extends z.ZodType>(path: string, schema: S): Promise<VikunjaResponse<z.infer<S>>> {
    return this.request('GET', path, schema)
  }

  private put<S extends z.ZodType>(
    path: string,
    schema: S,
    body: unknown,
  ): Promise<VikunjaResponse<z.infer<S>>> {
    return this.request('PUT', path, schema, body)
  }

  /**
   * Reads a plain paginated collection (`/projects`, `/labels`) to the end.
   *
   * Unlike the view endpoint, these report an honest
   * `x-pagination-total-pages`, so the header is the stop condition. A
   * missing header falls back to "stop on the first short page", and
   * `VIKUNJA_MAX_PULL_PAGES` bounds both.
   */
  private async getAllPages<I extends z.ZodType>(
    path: string,
    item: I,
  ): Promise<VikunjaResponse<z.infer<I>[]>> {
    const schema = z.array(item)
    const collected: z.infer<I>[] = []

    for (let page = 1; page <= VIKUNJA_MAX_PULL_PAGES; page += 1) {
      const out = await this.requestWithHeaders(
        'GET',
        `${path}?per_page=${VIKUNJA_PAGE_SIZE}&page=${page}`,
        schema,
      )
      if (!out.ok) return out

      collected.push(...out.value.value)

      const total = totalPages(out.value.headers)
      if (total === null) {
        if (out.value.value.length < VIKUNJA_PAGE_SIZE) break
      } else if (page >= total) {
        break
      }
      if (page === VIKUNJA_MAX_PULL_PAGES) warnPageCap(path)
    }

    return { ok: true, value: collected }
  }

  /** Drops the headers `requestWithHeaders` collected; most callers want only the body. */
  private async request<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<VikunjaResponse<z.infer<S>>> {
    const out = await this.requestWithHeaders(method, path, schema, body)
    return out.ok ? { ok: true, value: out.value.value } : out
  }

  /**
   * Runs one request, retrying only a 5xx and only on the documented
   * schedule. Every other outcome — including a thrown fetch and a timeout —
   * is final: DNS failures and rejected bodies do not improve with waiting.
   */
  private async requestWithHeaders<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<VikunjaResponse<WithHeaders<z.infer<S>>>> {
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
  ): Promise<Attempt<WithHeaders<z.infer<S>>>> {
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
  ): Promise<Attempt<WithHeaders<z.infer<S>>>> {
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
    return {
      retry: false,
      response: { ok: true, value: { value: parsed.data, headers: res.headers } },
    }
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
