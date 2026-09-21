import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VikunjaClient } from '@/background/vikunja/client.ts'
import {
  VIKUNJA_BACKOFF_MS,
  VIKUNJA_MAX_PULL_PAGES,
  VIKUNJA_OP_DEADLINE_MS,
  VIKUNJA_REQUEST_TIMEOUT_MS,
} from '@/background/vikunja/constants.ts'

const BASE_URL = 'https://vikunja.example'
const TOKEN = 'tk_super-secret-value'
const INFO_URL = 'https://vikunja.example/api/v1/info'

const INFO_BODY = { version: 'v2.6.0', max_items_per_page: 50 }
const USER_BODY = { id: 1, username: 'probe', name: '' }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Answers every call with the same status/body. */
function stubFetch(responder: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(responder)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function stubStatus(status: number, body: unknown = {}) {
  return stubFetch(async () => jsonResponse(status, body))
}

function client() {
  return new VikunjaClient(BASE_URL, TOKEN)
}

function initOf(fetchMock: ReturnType<typeof stubFetch>, index = 0): RequestInit {
  return fetchMock.mock.calls[index][1]
}

beforeEach(() => {
  vi.useFakeTimers()
  // The client warns on every retry; keep the suite output readable and make
  // the "nothing secret is logged" assertions possible.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('request shape', () => {
  it('hits /api/v1 under the base url and sends a bearer token header', async () => {
    const fetchMock = stubStatus(200, INFO_BODY)

    await expect(client().getInfo()).resolves.toEqual({ ok: true, value: INFO_BODY })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(INFO_URL)
    expect(initOf(fetchMock).headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
    })
  })

  it('never puts the token in a URL', async () => {
    const fetchMock = stubStatus(200, USER_BODY)

    await client().getCurrentUser()

    expect(fetchMock.mock.calls[0][0]).toBe('https://vikunja.example/api/v1/user')
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain(TOKEN)
    }
  })

  it('refuses redirects, omits cookies and bypasses the cache', async () => {
    const fetchMock = stubStatus(200, INFO_BODY)

    await client().getInfo()

    const init = initOf(fetchMock)
    expect(init.redirect).toBe('error')
    expect(init.credentials).toBe('omit')
    expect(init.cache).toBe('no-store')
    expect(init.method).toBe('GET')
    // GET carries no body, so no Content-Type is negotiated.
    expect(init.body).toBeUndefined()
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('parses the response with the endpoint schema', async () => {
    stubStatus(200, { ...USER_BODY, extra: 'kept by the loose user schema' })

    await expect(client().getCurrentUser()).resolves.toMatchObject({
      ok: true,
      value: { username: 'probe' },
    })
  })
})

describe('status mapping', () => {
  it.each([401, 403])('maps %i to authInvalid', async (status) => {
    const fetchMock = stubStatus(status, { code: 11, message: 'invalid token provided' })

    await expect(client().getInfo()).resolves.toEqual({ ok: false, errorKey: 'authInvalid' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps 404 to notFound', async () => {
    stubStatus(404, { message: 'not found' })

    await expect(client().getInfo()).resolves.toEqual({ ok: false, errorKey: 'notFound' })
  })

  it('maps 429 to rateLimited without retrying', async () => {
    const fetchMock = stubStatus(429, {})

    await expect(client().getInfo()).resolves.toEqual({ ok: false, errorKey: 'rateLimited' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps 400 to unknown — a rejected body is our bug, not a credential problem', async () => {
    const fetchMock = stubStatus(400, {
      code: 2004,
      message: 'Invalid model provided: Bad Request',
    })

    await expect(client().getInfo()).resolves.toEqual({ ok: false, errorKey: 'unknown' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps a body that is not JSON to unknown', async () => {
    stubFetch(async () => new Response('<html>502 from the proxy</html>', { status: 200 }))

    await expect(client().getInfo()).resolves.toEqual({ ok: false, errorKey: 'unknown' })
  })

  it('maps a Zod mismatch to unknown', async () => {
    stubStatus(200, { max_items_per_page: 50 })

    await expect(client().getInfo()).resolves.toEqual({ ok: false, errorKey: 'unknown' })
  })

  it('maps a thrown fetch to network without retrying', async () => {
    const fetchMock = stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(client().getInfo()).resolves.toEqual({ ok: false, errorKey: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('timeout', () => {
  it('reports network when the abort lands while the body is being read', async () => {
    // Headers arrive, then the body stalls and the timeout fires into the
    // middle of `res.json()`. That is a transport failure, not a malformed
    // payload.
    const fetchMock = stubFetch(
      async (_url, init) =>
        ({
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
            }),
        }) as unknown as Response,
    )

    const pending = client().getInfo()
    await vi.advanceTimersByTimeAsync(VIKUNJA_REQUEST_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({ ok: false, errorKey: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts a hanging request and reports network', async () => {
    const fetchMock = stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )

    const pending = client().getInfo()

    await vi.advanceTimersByTimeAsync(VIKUNJA_REQUEST_TIMEOUT_MS - 1)
    expect(initOf(fetchMock).signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)

    await expect(pending).resolves.toEqual({ ok: false, errorKey: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('5xx backoff', () => {
  it('retries on the documented schedule and then gives up with network', async () => {
    const fetchMock = stubStatus(500, { message: 'boom' })

    const pending = client().getInfo()

    // The original attempt goes out immediately; the three retries wait.
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    for (const [index, ms] of VIKUNJA_BACKOFF_MS.entries()) {
      await vi.advanceTimersByTimeAsync(ms - 1)
      expect(fetchMock).toHaveBeenCalledTimes(index + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchMock).toHaveBeenCalledTimes(index + 2)
    }

    await expect(pending).resolves.toEqual({ ok: false, errorKey: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(VIKUNJA_BACKOFF_MS.length + 1)
  })

  it('uses the exact delays 1000 / 4000 / 12000', () => {
    expect(VIKUNJA_BACKOFF_MS).toEqual([1000, 4000, 12_000])
  })

  it('succeeds after a single retry when the instance recovers', async () => {
    let calls = 0
    const fetchMock = stubFetch(async () => {
      calls += 1
      return calls === 1 ? jsonResponse(503, {}) : jsonResponse(200, INFO_BODY)
    })

    const pending = client().getInfo()
    await vi.advanceTimersByTimeAsync(VIKUNJA_BACKOFF_MS[0])

    await expect(pending).resolves.toEqual({ ok: true, value: INFO_BODY })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('abandons the remaining retries once the operation budget is spent', async () => {
    // Each attempt answers 500 after 15 s — slow, but under the 20 s
    // per-request timeout, so it retries rather than aborting. Three such
    // attempts plus their waits cross the 45 s budget, and the fourth attempt
    // the backoff table would allow is never made.
    const ATTEMPT_MS = 15_000
    const fetchMock = stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => resolve(jsonResponse(500, { message: 'boom' })), ATTEMPT_MS)
        }),
    )

    const pending = client().getInfo()
    await vi.advanceTimersByTimeAsync(VIKUNJA_OP_DEADLINE_MS * 2)

    await expect(pending).resolves.toEqual({ ok: false, errorKey: 'network' })
    // Stopped one short of `1 + VIKUNJA_BACKOFF_MS.length`.
    expect(fetchMock).toHaveBeenCalledTimes(VIKUNJA_BACKOFF_MS.length)
  })

  it('keeps the full retry budget when the attempts themselves are fast', async () => {
    const fetchMock = stubStatus(500, { message: 'boom' })

    const pending = client().getInfo()
    await vi.advanceTimersByTimeAsync(VIKUNJA_OP_DEADLINE_MS)

    await expect(pending).resolves.toEqual({ ok: false, errorKey: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(VIKUNJA_BACKOFF_MS.length + 1)
  })

  it('logs only the path template and the status — never the token or the host', async () => {
    const warn = vi.mocked(console.warn)
    stubStatus(500, { message: 'boom' })

    const pending = client().getInfo()
    await vi.advanceTimersByTimeAsync(VIKUNJA_BACKOFF_MS.reduce((a, b) => a + b, 0))
    await pending

    expect(warn).toHaveBeenCalledTimes(VIKUNJA_BACKOFF_MS.length)
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('/info')
    expect(logged).toContain('500')
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain('vikunja.example')
  })
})

// ---------- read path (task 5) ----------

const VIEW_BASE = 'https://vikunja.example/api/v1/projects/1/views/4'

function kanbanView(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    title: 'Kanban',
    view_kind: 'kanban',
    done_bucket_id: 3,
    default_bucket_id: 1,
    ...overrides,
  }
}

function project(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Project ${id}`,
    identifier: '',
    is_archived: false,
    views: [kanbanView()],
    ...overrides,
  }
}

function bucket(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Bucket ${id}`,
    project_view_id: 4,
    position: id * 100,
    limit: 0,
    ...overrides,
  }
}

function task(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    identifier: `#${id}`,
    index: id,
    project_id: 1,
    bucket_id: 1,
    title: `Task ${id}`,
    description: '',
    done: false,
    done_at: '0001-01-01T00:00:00Z',
    due_date: '0001-01-01T00:00:00Z',
    start_date: '0001-01-01T00:00:00Z',
    end_date: '0001-01-01T00:00:00Z',
    priority: 0,
    percent_done: 0,
    created: '2026-09-20T17:00:00+03:00',
    updated: '2026-09-20T17:00:00+03:00',
    labels: null,
    assignees: null,
    reminders: null,
    repeat_after: 0,
    repeat_mode: 0,
    hex_color: '',
    position: id * 100,
    is_favorite: false,
    related_tasks: null,
    attachments: null,
    cover_image_attachment_id: 0,
    ...overrides,
  }
}

/** A page of buckets with tasks, as the kanban view endpoint answers. */
function pagedResponse(body: unknown, totalPages?: number): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (totalPages !== undefined) headers['x-pagination-total-pages'] = String(totalPages)
  return new Response(JSON.stringify(body), { status: 200, headers })
}

describe('paged collections', () => {
  it('follows x-pagination-total-pages across every page of /projects', async () => {
    const fetchMock = stubFetch(async (url) =>
      url.includes('page=2') ? pagedResponse([project(2)], 2) : pagedResponse([project(1)], 2),
    )

    const out = await client().getProjects()

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value.map((p) => p.id)).toEqual([1, 2])
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://vikunja.example/api/v1/projects?per_page=50&page=1',
      'https://vikunja.example/api/v1/projects?per_page=50&page=2',
    ])
  })

  it('stops after one page when the header says there is only one', async () => {
    const fetchMock = stubFetch(async () => pagedResponse([project(1)], 1))

    await expect(client().getProjects()).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to "stop on a short page" when the header is missing', async () => {
    const fetchMock = stubFetch(async () => pagedResponse([project(1)]))

    await expect(client().getProjects()).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('pages /labels the same way', async () => {
    const label = { id: 1, title: 'energy:1', hex_color: 'efbdeb' }
    const fetchMock = stubFetch(async () => pagedResponse([label], 1))

    await expect(client().getLabels()).resolves.toEqual({ ok: true, value: [label] })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://vikunja.example/api/v1/labels?per_page=50&page=1',
    )
  })

  it('propagates a failure from any page and stops paging', async () => {
    const fetchMock = stubFetch(async (url) =>
      url.includes('page=2') ? jsonResponse(401, { code: 11 }) : pagedResponse([project(1)], 3),
    )

    await expect(client().getProjects()).resolves.toEqual({ ok: false, errorKey: 'authInvalid' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never exceeds the page cap', async () => {
    // A server that always claims one more page than it delivered.
    const fetchMock = stubFetch(async () => pagedResponse([project(1)], 9999))

    await expect(client().getProjects()).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(VIKUNJA_MAX_PULL_PAGES)
  })
})

describe('view endpoints', () => {
  it('reads one view', async () => {
    const fetchMock = stubStatus(200, kanbanView())

    await expect(client().getView(1, 4)).resolves.toEqual({ ok: true, value: kanbanView() })
    expect(fetchMock.mock.calls[0][0]).toBe(VIEW_BASE)
  })

  it('reads the buckets of a view', async () => {
    const fetchMock = stubStatus(200, [bucket(1), bucket(3)])

    const out = await client().getBuckets(1, 4)

    expect(out).toMatchObject({ ok: true })
    expect(fetchMock.mock.calls[0][0]).toBe(`${VIEW_BASE}/buckets`)
  })

  it('creates a bucket with PUT and a JSON body', async () => {
    const fetchMock = stubStatus(201, bucket(25, { title: '__probe__' }))

    await expect(client().createBucket(1, 4, '__probe__')).resolves.toMatchObject({
      ok: true,
      value: { id: 25, title: '__probe__' },
    })

    expect(fetchMock.mock.calls[0][0]).toBe(`${VIEW_BASE}/buckets`)
    const init = initOf(fetchMock)
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify({ title: '__probe__' }))
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    })
    // The security options are not per-verb.
    expect(init.redirect).toBe('error')
    expect(init.credentials).toBe('omit')
  })
})

describe('getViewTasks', () => {
  it('returns every bucket with its tasks filled, empty ones included', async () => {
    const fetchMock = stubFetch(async () =>
      pagedResponse([{ ...bucket(1), tasks: [task(4)] }, bucket(3)], 2),
    )

    const out = await client().getViewTasks(1, 4)

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value.map((b) => [b.id, b.tasks?.length])).toEqual([
      [1, 1],
      [3, 0],
    ])
    // `x-pagination-total-pages: 2` counts buckets, not pages — a second
    // request would be wrong here (recon Q15).
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${VIEW_BASE}/tasks?per_page=50&page=1`)
  })

  it('keeps paging while any bucket returned a full page, and merges per bucket', async () => {
    const firstPage = Array.from({ length: 50 }, (_unused, index) => task(index + 1))
    const fetchMock = stubFetch(async (url) =>
      url.includes('page=2')
        ? pagedResponse([{ ...bucket(1), tasks: [task(51)] }, bucket(3)])
        : pagedResponse([{ ...bucket(1), tasks: firstPage }, bucket(3)]),
    )

    const out = await client().getViewTasks(1, 4)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value[0].tasks).toHaveLength(51)
    expect(out.value[0].tasks?.at(-1)?.id).toBe(51)
  })

  it('never lets a repeated task through twice', async () => {
    const firstPage = Array.from({ length: 50 }, (_unused, index) => task(index + 1))
    const fetchMock = stubFetch(async (url) =>
      url.includes('page=2')
        ? pagedResponse([{ ...bucket(1), tasks: [task(50), task(51)] }])
        : pagedResponse([{ ...bucket(1), tasks: firstPage }]),
    )

    const out = await client().getViewTasks(1, 4)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value[0].tasks?.map((t) => t.id)).toHaveLength(51)
  })

  it('stops at the page cap when the instance keeps answering full pages', async () => {
    const fullPage = Array.from({ length: 50 }, (_unused, index) => task(index + 1))
    const fetchMock = stubFetch(async () => pagedResponse([{ ...bucket(1), tasks: fullPage }]))

    await expect(client().getViewTasks(1, 4)).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(VIKUNJA_MAX_PULL_PAGES)
  })

  it('propagates a failure mid-pull', async () => {
    const fullPage = Array.from({ length: 50 }, (_unused, index) => task(index + 1))
    const fetchMock = stubFetch(async (url) =>
      url.includes('page=2')
        ? jsonResponse(404, { message: 'gone' })
        : pagedResponse([{ ...bucket(1), tasks: fullPage }]),
    )

    await expect(client().getViewTasks(1, 4)).resolves.toEqual({ ok: false, errorKey: 'notFound' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
