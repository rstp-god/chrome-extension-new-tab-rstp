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

// ---------- read path ----------

const VIEW_PATH = '/projects/1/views/4'
const VIEW_BASE = `https://vikunja.example/api/v1${VIEW_PATH}`

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

  it('propagates a failure from any page and stops paging', async () => {
    const fetchMock = stubFetch(async (url) =>
      url.includes('page=2') ? jsonResponse(401, { code: 11 }) : pagedResponse([project(1)], 3),
    )

    await expect(client().getProjects()).resolves.toEqual({ ok: false, errorKey: 'authInvalid' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never exceeds the page cap, and warns when it is hit', async () => {
    // A server that always claims one more page than it delivered.
    const fetchMock = stubFetch(async () => pagedResponse([project(1)], 9999))

    await expect(client().getProjects()).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(VIKUNJA_MAX_PULL_PAGES)
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith('[vikunja] page cap reached', {
      path: '/projects',
    })
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
        ? // Task 50 is on both pages; only 51 is new.
          pagedResponse([{ ...bucket(1), tasks: [task(50), task(51)] }])
        : pagedResponse([{ ...bucket(1), tasks: firstPage }]),
    )

    const out = await client().getViewTasks(1, 4)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    // Exactly 1..51, in page order, with no duplicate of 50.
    expect(out.value[0].tasks?.map((entry) => entry.id)).toEqual(
      Array.from({ length: 51 }, (_unused, index) => index + 1),
    )
  })

  it('stops at the page cap when the instance keeps answering full pages, and says so', async () => {
    const fullPage = Array.from({ length: 50 }, (_unused, index) => task(index + 1))
    const fetchMock = stubFetch(async () => pagedResponse([{ ...bucket(1), tasks: fullPage }]))

    await expect(client().getViewTasks(1, 4)).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(VIKUNJA_MAX_PULL_PAGES)
    // A truncated board must not be silent.
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith('[vikunja] page cap reached', {
      path: `${VIEW_PATH}/tasks`,
    })
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

// ---------- write path ----------

const TASKS_BASE = 'https://vikunja.example/api/v1/tasks'

/** A promise plus the handles to settle it from the test body. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/**
 * A task with every field a real one carries filled in, plus a key this build
 * has never heard of. This is the fixture of the read-modify-write regression:
 * all of it has to come back out of `updateTask` untouched.
 */
const RICH_TASK = task(4, {
  title: 'Probe',
  description: '<p>rich description</p>',
  due_date: '2026-12-31T12:00:00Z',
  priority: 3,
  percent_done: 0.5,
  assignees: [{ id: 1, username: 'probe', name: '' }],
  reminders: [{ relative_period: -3600, relative_to: 'due_date' }],
  repeat_after: 86_400,
  hex_color: 'ff00ff',
  labels: null,
  some_future_field: { nested: 'a Vikunja we have not shipped against yet' },
})

/** `updated` of `RICH_TASK`, as the instance spells it (seconds). */
const RICH_ETAG = '2026-09-20T17:00:00+03:00'

/** Method + path of every call, for order assertions. */
function trace(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return fetchMock.mock.calls.map(
    ([url, init]) => `${init.method} ${String(url).replace('https://vikunja.example/api/v1', '')}`,
  )
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>, index: number): unknown {
  return JSON.parse(String(initOf(fetchMock, index).body))
}

describe('updateTask (read-modify-write)', () => {
  it('POSTs the whole record back, so a partial edit cannot blank a field', async () => {
    // Recon Q9: `POST /tasks/:id` is a full replace. Sending `{title}` alone
    // wipes description, due_date, priority and percent_done in the user's
    // own tracker — this is the test that fails if the merge base is ever
    // narrowed.
    const fetchMock = stubFetch(async (_url, init) =>
      jsonResponse(200, init.method === 'GET' ? RICH_TASK : { ...RICH_TASK, title: 'renamed' }),
    )

    const out = await client().updateTask(4, { title: 'renamed' }, RICH_ETAG)

    expect(out).toMatchObject({ ok: true, value: { id: 4, title: 'renamed' } })
    expect(trace(fetchMock)).toEqual(['GET /tasks/4', 'POST /tasks/4'])

    // Raw, not normalised: the zero dates stay their sentinel strings and
    // `labels: null` stays null, because what we POST is the JSON we were
    // handed — not the parsed view of it.
    expect(bodyOf(fetchMock, 1)).toEqual({ ...RICH_TASK, title: 'renamed' })
  })

  it('sends only the keys the patch carries, and never touches done_at', async () => {
    const fetchMock = stubFetch(async (_url, init) =>
      jsonResponse(200, init.method === 'GET' ? RICH_TASK : { ...RICH_TASK, done: true }),
    )

    await client().updateTask(4, { done: true }, RICH_ETAG)

    const body = bodyOf(fetchMock, 1) as Record<string, unknown>
    expect(body.done).toBe(true)
    // `done_at` is the server's to maintain (recon Q7) — ours is the value we
    // read, unchanged.
    expect(body.done_at).toBe(RICH_TASK.done_at)
    expect(body.title).toBe(RICH_TASK.title)
    expect(body.description).toBe(RICH_TASK.description)
  })

  it('reports conflict without POSTing when the task moved under us', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, RICH_TASK))

    await expect(
      client().updateTask(4, { title: 'x' }, '2026-09-20T18:00:00+03:00'),
    ).resolves.toEqual({ ok: false, errorKey: 'conflict' })

    // The read happened; the write did not. That is the whole value of the etag.
    expect(trace(fetchMock)).toEqual(['GET /tasks/4'])
  })

  it.each([
    ['nanoseconds in the known etag', '2026-09-20T17:00:00.988820952+03:00', RICH_ETAG],
    ['nanoseconds in the response', RICH_ETAG, '2026-09-20T17:00:00.988820952+03:00'],
    ['a different zone spelling the same instant', '2026-09-20T14:00:00Z', RICH_ETAG],
  ])('treats %s as the same version', async (_label, knownEtag, serverUpdated) => {
    // Recon Q16: mutations answer nanoseconds, reads answer seconds. Comparing
    // them raw would report a conflict on every second edit.
    const fetchMock = stubFetch(async (_url, init) =>
      jsonResponse(200, {
        ...RICH_TASK,
        updated: init.method === 'GET' ? serverUpdated : RICH_ETAG,
      }),
    )

    await expect(client().updateTask(4, { title: 'x' }, knownEtag)).resolves.toMatchObject({
      ok: true,
    })
    expect(trace(fetchMock)).toEqual(['GET /tasks/4', 'POST /tasks/4'])
  })

  it('propagates a failed read without writing', async () => {
    const fetchMock = stubStatus(404, { message: 'gone' })

    await expect(client().updateTask(4, { title: 'x' }, RICH_ETAG)).resolves.toEqual({
      ok: false,
      errorKey: 'notFound',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('serialises two edits of the same task, read-write pair by read-write pair', async () => {
    const firstPostSeen = deferred<void>()
    const releaseFirstPost = deferred<void>()

    const fetchMock = stubFetch(async (_url, init) => {
      if (init.method === 'POST' && fetchMock.mock.calls.length === 2) {
        firstPostSeen.resolve()
        await releaseFirstPost.promise
      }
      return jsonResponse(200, RICH_TASK)
    })

    const first = client().updateTask(4, { title: 'a' }, RICH_ETAG)
    const second = client().updateTask(4, { title: 'b' }, RICH_ETAG)

    // No timer games needed: the second job is chained onto the first, so if
    // its GET had run at all it would already be in the trace.
    await firstPostSeen.promise
    expect(trace(fetchMock)).toEqual(['GET /tasks/4', 'POST /tasks/4'])

    releaseFirstPost.resolve()
    await Promise.all([first, second])

    // The second cycle reads *after* the first one wrote — which is the only
    // reason its merge base is current.
    expect(trace(fetchMock)).toEqual([
      'GET /tasks/4',
      'POST /tasks/4',
      'GET /tasks/4',
      'POST /tasks/4',
    ])
  })

  it('lets edits of different tasks overlap', async () => {
    const blockedGetSeen = deferred<void>()
    const releaseBlockedGet = deferred<void>()

    const fetchMock = stubFetch(async (url, init) => {
      if (String(url).includes('/tasks/4') && init.method === 'GET') {
        blockedGetSeen.resolve()
        await releaseBlockedGet.promise
      }
      return jsonResponse(200, { ...RICH_TASK, id: String(url).includes('/tasks/5') ? 5 : 4 })
    })

    const blocked = client().updateTask(4, { title: 'a' }, RICH_ETAG)
    await blockedGetSeen.promise

    // A global lock would deadlock here instead of answering.
    await expect(client().updateTask(5, { title: 'b' }, RICH_ETAG)).resolves.toMatchObject({
      ok: true,
    })

    releaseBlockedGet.resolve()
    await expect(blocked).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

describe('createTask', () => {
  it('PUTs exactly a title and a description to the project', async () => {
    const fetchMock = stubStatus(201, task(7, { title: 'New', description: '<p>d</p>' }))

    await expect(
      client().createTask(1, { title: 'New', description: '<p>d</p>' }),
    ).resolves.toMatchObject({ ok: true, value: { id: 7 } })

    expect(fetchMock.mock.calls[0][0]).toBe('https://vikunja.example/api/v1/projects/1/tasks')
    expect(initOf(fetchMock).method).toBe('PUT')
    expect(bodyOf(fetchMock, 0)).toEqual({ title: 'New', description: '<p>d</p>' })
  })

  it('sends an empty description rather than omitting the key', async () => {
    const fetchMock = stubStatus(201, task(7))

    await client().createTask(1, { title: 'New' })

    expect(bodyOf(fetchMock, 0)).toEqual({ title: 'New', description: '' })
  })
})

describe('moveToBucket', () => {
  it('POSTs { task_id } to the bucket endpoint and reads the TaskBucket back', async () => {
    // Recon Q4: this is the only working form of the move, and its embedded
    // task is authoritative for `done` / `done_at`.
    const fetchMock = stubStatus(200, {
      task_id: 4,
      bucket_id: 3,
      project_view_id: 4,
      task: { ...RICH_TASK, done: true, done_at: '2026-09-20T14:58:54.988789804Z' },
    })

    const out = await client().moveToBucket(1, 4, 3, 4)

    expect(out).toMatchObject({ ok: true, value: { bucketId: 3, task: { done: true } } })
    expect(fetchMock.mock.calls[0][0]).toBe(`${VIEW_BASE}/buckets/3/tasks`)
    expect(initOf(fetchMock).method).toBe('POST')
    expect(bodyOf(fetchMock, 0)).toEqual({ task_id: 4 })
  })

  it('serialises with an edit of the same task', async () => {
    const getSeen = deferred<void>()
    const releaseGet = deferred<void>()

    const fetchMock = stubFetch(async (url, init) => {
      if (init.method === 'GET') {
        getSeen.resolve()
        await releaseGet.promise
      }
      return jsonResponse(
        200,
        String(url).includes('/buckets/')
          ? { task_id: 4, bucket_id: 3, project_view_id: 4, task: RICH_TASK }
          : RICH_TASK,
      )
    })

    const edit = client().updateTask(4, { title: 'a' }, RICH_ETAG)
    await getSeen.promise
    const move = client().moveToBucket(1, 4, 3, 4)

    expect(trace(fetchMock)).toEqual(['GET /tasks/4'])

    releaseGet.resolve()
    await Promise.all([edit, move])
    expect(trace(fetchMock)).toEqual([
      'GET /tasks/4',
      'POST /tasks/4',
      'POST /projects/1/views/4/buckets/3/tasks',
    ])
  })
})

describe('delete', () => {
  it('deletes a task', async () => {
    const fetchMock = stubStatus(200, { message: 'Successfully deleted.' })

    await expect(client().deleteTask(4)).resolves.toEqual({
      ok: true,
      value: { message: 'Successfully deleted.' },
    })
    expect(fetchMock.mock.calls[0][0]).toBe(`${TASKS_BASE}/4`)
    expect(initOf(fetchMock).method).toBe('DELETE')
  })
})

describe('getTaskRaw', () => {
  it('hands over the raw body and the parsed task side by side', async () => {
    stubStatus(200, RICH_TASK)

    const out = await client().getTaskRaw(4)

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    // Raw: exactly the wire.
    expect(out.value.raw).toEqual(RICH_TASK)
    // Parsed: sentinels collapsed, null collections filled — for reading only.
    expect(out.value.task.due_date).toBe('2026-12-31T12:00:00Z')
    expect(out.value.task.done_at).toBeNull()
    expect(out.value.task.labels).toEqual([])
  })

  it('never carries a prototype-poisoning key into the body it will write back', async () => {
    // A shared project is enough for someone else to put this task there.
    stubStatus(
      200,
      JSON.parse(
        `{"__proto__":{"polluted":true},"constructor":1,"prototype":2,${JSON.stringify(
          RICH_TASK,
        ).slice(1)}`,
      ),
    )

    const out = await client().getTaskRaw(4)

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(Object.keys(out.value.raw)).not.toContain('__proto__')
    expect(Object.keys(out.value.raw)).not.toContain('constructor')
    expect(Object.keys(out.value.raw)).not.toContain('prototype')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('create serialisation', () => {
  it('runs two creates in one project one after the other', async () => {
    // Every task in a project competes for the same `index` (and the
    // `identifier` derived from it, recon Q19), and the create endpoint has no
    // task id to serialise on — so the project is the key.
    const firstSeen = deferred<void>()
    const releaseFirst = deferred<void>()

    const fetchMock = stubFetch(async () => {
      if (fetchMock.mock.calls.length === 1) {
        firstSeen.resolve()
        await releaseFirst.promise
      }
      return jsonResponse(201, task(7))
    })

    const first = client().createTask(1, { title: 'a' })
    const second = client().createTask(1, { title: 'b' })

    await firstSeen.promise
    expect(fetchMock).toHaveBeenCalledTimes(1)

    releaseFirst.resolve()
    await Promise.all([first, second])
    expect(trace(fetchMock)).toEqual(['PUT /projects/1/tasks', 'PUT /projects/1/tasks'])
  })

  it('lets creates in different projects overlap', async () => {
    const blockedSeen = deferred<void>()
    const releaseBlocked = deferred<void>()

    const fetchMock = stubFetch(async (url) => {
      if (String(url).includes('/projects/1/')) {
        blockedSeen.resolve()
        await releaseBlocked.promise
      }
      return jsonResponse(201, task(7))
    })

    const blocked = client().createTask(1, { title: 'a' })
    await blockedSeen.promise

    // A per-project key must not turn into a global one.
    await expect(client().createTask(2, { title: 'b' })).resolves.toMatchObject({ ok: true })

    releaseBlocked.resolve()
    await expect(blocked).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not serialise a create against an edit of an unrelated task', async () => {
    const createSeen = deferred<void>()
    const releaseCreate = deferred<void>()

    const fetchMock = stubFetch(async (url, init) => {
      if (init.method === 'PUT') {
        createSeen.resolve()
        await releaseCreate.promise
        return jsonResponse(201, task(7))
      }
      return jsonResponse(200, RICH_TASK)
    })

    const create = client().createTask(1, { title: 'a' })
    await createSeen.promise

    await expect(client().updateTask(4, { title: 'x' }, RICH_ETAG)).resolves.toMatchObject({
      ok: true,
    })

    releaseCreate.resolve()
    await create
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
