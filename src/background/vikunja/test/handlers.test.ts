import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  handleVikunjaRequest,
  vikunjaWireSchema,
  withVikunjaClient,
} from '@/background/vikunja/handlers.ts'

import type { VikunjaConnectInfo } from '@/background/vikunja/messages.ts'

const TOKEN = 'tk_super-secret-value'
const INFO_BODY = { version: 'v2.6.0', max_items_per_page: 50 }
const USER_BODY = { id: 1, username: 'probe', name: '' }

type Responder = (url: string) => Response

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Happy-path instance: `/info` and `/user` both answer. */
const healthyInstance: Responder = (url) =>
  url.endsWith('/user') ? jsonResponse(200, USER_BODY) : jsonResponse(200, INFO_BODY)

function stubFetch(responder: Responder = healthyInstance) {
  const fetchMock = vi.fn(async (url: string) => responder(url))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Installs a `chrome.permissions` whose `contains` answers `granted`. */
function stubPermissions(granted: boolean | Error) {
  const contains = vi.fn(async () => {
    if (granted instanceof Error) throw granted
    return granted
  })
  Object.defineProperty(globalThis, 'chrome', {
    value: { permissions: { contains } },
    configurable: true,
  })
  return contains
}

function connect(baseUrl: string, token = TOKEN) {
  return handleVikunjaRequest({ type: 'vikunja', op: 'connect', cfg: { baseUrl, token } })
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
})

describe('vikunjaWireSchema', () => {
  it.each([
    ['https://vikunja.example', 'https://vikunja.example'],
    ['https://vikunja.example/', 'https://vikunja.example'],
    ['https://vikunja.example/api/v1', 'https://vikunja.example'],
    ['https://vikunja.example/api/v1/', 'https://vikunja.example'],
    ['  https://vikunja.example/  ', 'https://vikunja.example'],
    ['https://vikunja.example:8443', 'https://vikunja.example:8443'],
    ['https://host.example/vikunja/api/v1', 'https://host.example/vikunja'],
  ])('normalises %s to %s', (input, expected) => {
    const parsed = vikunjaWireSchema.safeParse({ baseUrl: input, token: TOKEN })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.baseUrl).toBe(expected)
  })

  it.each([
    ['http://vikunja.example'],
    ['https://user:pass@vikunja.example'],
    ['https://vikunja.example/?token=leak'],
    ['https://vikunja.example/#frag'],
    ['vikunja.example'],
    [''],
    // Wildcard hosts: accepted by `new URL`, read as "every host" by a
    // Chrome match pattern.
    ['https://*'],
    ['https://%2A'],
    ['https://*.example.com'],
    ['https://[::1]'],
  ])('rejects %s', (input) => {
    expect(vikunjaWireSchema.safeParse({ baseUrl: input, token: TOKEN }).success).toBe(false)
  })

  it('rejects an empty or absurdly long token', () => {
    const base = 'https://vikunja.example'

    expect(vikunjaWireSchema.safeParse({ baseUrl: base, token: '' }).success).toBe(false)
    expect(vikunjaWireSchema.safeParse({ baseUrl: base, token: 'x'.repeat(4097) }).success).toBe(
      false,
    )
    expect(vikunjaWireSchema.safeParse({ baseUrl: base, token: 'x'.repeat(4096) }).success).toBe(
      true,
    )
  })
})

describe('connect: refusals that cost no network', () => {
  it.each([
    ['plain http', 'http://vikunja.example', TOKEN],
    ['credentials in the URL', 'https://user:pass@vikunja.example', TOKEN],
    ['a query string', 'https://vikunja.example/?a=1', TOKEN],
    ['an empty token', 'https://vikunja.example', ''],
    ['a non-URL', 'not a url at all', TOKEN],
    // The critical ones: a wildcard host must not even reach the permission
    // gate, or `permissions.contains({origins:['https://*/*']})` would answer
    // true for any grant the user ever made.
    ['a bare wildcard host', 'https://*', TOKEN],
    ['a percent-encoded wildcard host', 'https://%2A', TOKEN],
    ['a wildcard subdomain', 'https://*.example.com', TOKEN],
    ['a bracketed IPv6 host', 'https://[::1]', TOKEN],
  ])('answers unknown for %s and never fetches', async (_label, baseUrl, token) => {
    const fetchMock = stubFetch()
    const contains = stubPermissions(true)

    await expect(connect(baseUrl, token)).resolves.toEqual({ ok: false, errorKey: 'unknown' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(contains).not.toHaveBeenCalled()
  })

  it('answers permissionMissing when the host was never granted', async () => {
    const fetchMock = stubFetch()
    const contains = stubPermissions(false)

    await expect(connect('https://vikunja.example')).resolves.toEqual({
      ok: false,
      errorKey: 'permissionMissing',
    })

    expect(contains).toHaveBeenCalledWith({ origins: ['https://vikunja.example/*'] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a throwing permissions API as not granted', async () => {
    const fetchMock = stubFetch()
    stubPermissions(new Error('Invalid value for origins'))

    await expect(connect('https://vikunja.example')).resolves.toEqual({
      ok: false,
      errorKey: 'permissionMissing',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a missing permissions API as not granted', async () => {
    const fetchMock = stubFetch()
    Object.defineProperty(globalThis, 'chrome', { value: {}, configurable: true })

    await expect(connect('https://vikunja.example')).resolves.toEqual({
      ok: false,
      errorKey: 'permissionMissing',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks the permission for the host only, never a port-qualified origin', async () => {
    const contains = stubPermissions(false)
    stubFetch()

    await connect('https://vikunja.example:8443')

    expect(contains).toHaveBeenCalledWith({ origins: ['https://vikunja.example/*'] })
  })
})

describe('connect: the happy path', () => {
  it('reports the token owner and the instance version', async () => {
    stubPermissions(true)
    const fetchMock = stubFetch()

    const response = await connect('https://vikunja.example')

    expect(response).toEqual({
      ok: true,
      value: { userHandle: 'probe', version: 'v2.6.0' } satisfies VikunjaConnectInfo,
    })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://vikunja.example/api/v1/info',
      'https://vikunja.example/api/v1/user',
    ])
  })

  it.each([
    ['https://vikunja.example/', 'https://vikunja.example/api/v1/info'],
    ['https://vikunja.example/api/v1', 'https://vikunja.example/api/v1/info'],
  ])('normalises %s before building the request URL', async (baseUrl, expectedUrl) => {
    stubPermissions(true)
    const fetchMock = stubFetch()

    await expect(connect(baseUrl)).resolves.toMatchObject({ ok: true })
    expect(fetchMock.mock.calls[0][0]).toBe(expectedUrl)
  })

  it('propagates an auth failure from /user and stops there', async () => {
    stubPermissions(true)
    const fetchMock = stubFetch((url) =>
      url.endsWith('/user') ? jsonResponse(401, { code: 11 }) : jsonResponse(200, INFO_BODY),
    )

    await expect(connect('https://vikunja.example')).resolves.toEqual({
      ok: false,
      errorKey: 'authInvalid',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops at /info when the address is not a Vikunja instance', async () => {
    stubPermissions(true)
    const fetchMock = stubFetch(() => jsonResponse(404, { message: 'not found' }))

    await expect(connect('https://vikunja.example')).resolves.toEqual({
      ok: false,
      errorKey: 'notFound',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('withVikunjaClient', () => {
  it('never runs the body for a config that does not validate', async () => {
    const contains = stubPermissions(true)
    const run = vi.fn(async () => ({ ok: true as const, value: 1 }))

    await expect(withVikunjaClient({ baseUrl: 'https://*', token: TOKEN }, run)).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })

    expect(run).not.toHaveBeenCalled()
    expect(contains).not.toHaveBeenCalled()
  })

  it('never runs the body without the host permission', async () => {
    stubPermissions(false)
    const run = vi.fn(async () => ({ ok: true as const, value: 1 }))

    await expect(
      withVikunjaClient({ baseUrl: 'https://vikunja.example', token: TOKEN }, run),
    ).resolves.toEqual({ ok: false, errorKey: 'permissionMissing' })

    expect(run).not.toHaveBeenCalled()
  })

  it('hands a client built from the normalised base url to the body', async () => {
    stubPermissions(true)
    const fetchMock = stubFetch()

    const result = await withVikunjaClient(
      { baseUrl: 'https://vikunja.example/api/v1/', token: TOKEN },
      (client) => client.getInfo(),
    )

    expect(result).toEqual({ ok: true, value: INFO_BODY })
    expect(fetchMock.mock.calls[0][0]).toBe('https://vikunja.example/api/v1/info')
  })

  it('re-checks the permission on every call, never caching the answer', async () => {
    const contains = stubPermissions(true)
    stubFetch()
    const run = vi.fn(async () => ({ ok: true as const, value: 1 }))
    const cfg = { baseUrl: 'https://vikunja.example', token: TOKEN }

    await withVikunjaClient(cfg, run)
    await withVikunjaClient(cfg, run)

    expect(contains).toHaveBeenCalledTimes(2)
  })
})

// ---------- read path (task 5) ----------

const CFG = { baseUrl: 'https://vikunja.example', token: TOKEN }
const API = 'https://vikunja.example/api/v1'

const KANBAN_VIEW = {
  id: 4,
  title: 'Kanban',
  view_kind: 'kanban',
  done_bucket_id: 3,
  default_bucket_id: 1,
}

const LIST_VIEW = { ...KANBAN_VIEW, id: 2, title: 'List', view_kind: 'list' }

function projectBody(overrides: Record<string, unknown> = {}) {
  return { id: 1, title: 'Inbox', identifier: '', is_archived: false, views: [], ...overrides }
}

function bucketBody(id: number, title: string) {
  return { id, title, project_view_id: 4, position: id * 100, limit: 0 }
}

function taskBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    identifier: '#3',
    index: 3,
    project_id: 1,
    // `0` everywhere but inside a view response — the handler must ignore it.
    bucket_id: 0,
    title: 'Probe',
    description: '<p>rich</p>',
    done: false,
    done_at: '0001-01-01T00:00:00Z',
    due_date: '0001-01-01T00:00:00Z',
    start_date: '0001-01-01T00:00:00Z',
    end_date: '0001-01-01T00:00:00Z',
    priority: 0,
    percent_done: 0,
    created: '2026-09-20T17:00:00+03:00',
    updated: '2026-09-20T17:57:12.566126293+03:00',
    labels: null,
    assignees: null,
    reminders: null,
    repeat_after: 0,
    repeat_mode: 0,
    hex_color: '',
    position: 100,
    is_favorite: false,
    related_tasks: null,
    attachments: null,
    cover_image_attachment_id: 0,
    ...overrides,
  }
}

/** Routes by path suffix so each test only describes what it cares about. */
function routes(table: Record<string, unknown>): Responder {
  return (url) => {
    const path = url.slice(API.length).split('?')[0]
    const body = table[path]
    if (body === undefined) return jsonResponse(404, { message: `unrouted ${path}` })
    return jsonResponse(200, body)
  }
}

describe('listProjects', () => {
  it('summarises each project and finds its kanban view', async () => {
    stubPermissions(true)
    stubFetch(
      routes({
        '/projects': [
          projectBody({ views: [LIST_VIEW, KANBAN_VIEW] }),
          projectBody({ id: 2, title: 'Archived', is_archived: true, views: [KANBAN_VIEW] }),
          projectBody({ id: 3, title: 'No kanban', views: [LIST_VIEW] }),
        ],
      }),
    )

    const out = await handleVikunjaRequest({ type: 'vikunja', op: 'listProjects', cfg: CFG })

    expect(out).toEqual({
      ok: true,
      value: [
        {
          id: 1,
          title: 'Inbox',
          kanbanViewId: 4,
          doneBucketId: 3,
          defaultBucketId: 1,
          isArchived: false,
        },
        {
          id: 2,
          title: 'Archived',
          kanbanViewId: 4,
          doneBucketId: 3,
          defaultBucketId: 1,
          isArchived: true,
        },
        {
          id: 3,
          title: 'No kanban',
          kanbanViewId: null,
          doneBucketId: null,
          defaultBucketId: null,
          isArchived: false,
        },
      ],
    })
  })

  it('maps the 0 sentinel of a view without buckets to null', async () => {
    stubPermissions(true)
    stubFetch(
      routes({
        '/projects': [
          projectBody({
            views: [{ ...KANBAN_VIEW, done_bucket_id: 0, default_bucket_id: 0 }],
          }),
        ],
      }),
    )

    await expect(
      handleVikunjaRequest({ type: 'vikunja', op: 'listProjects', cfg: CFG }),
    ).resolves.toMatchObject({
      ok: true,
      value: [{ doneBucketId: null, defaultBucketId: null }],
    })
  })

  it('propagates a backend failure', async () => {
    stubPermissions(true)
    stubFetch(() => jsonResponse(401, { code: 11 }))

    await expect(
      handleVikunjaRequest({ type: 'vikunja', op: 'listProjects', cfg: CFG }),
    ).resolves.toEqual({ ok: false, errorKey: 'authInvalid' })
  })

  it('answers permissionMissing without fetching', async () => {
    stubPermissions(false)
    const fetchMock = stubFetch()

    await expect(
      handleVikunjaRequest({ type: 'vikunja', op: 'listProjects', cfg: CFG }),
    ).resolves.toEqual({ ok: false, errorKey: 'permissionMissing' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('listBuckets', () => {
  const request = { type: 'vikunja', op: 'listBuckets', cfg: CFG, projectId: 1, viewId: 4 } as const

  it('flags the view’s done bucket', async () => {
    stubPermissions(true)
    const fetchMock = stubFetch(
      routes({
        '/projects/1/views/4': KANBAN_VIEW,
        '/projects/1/views/4/buckets': [
          bucketBody(1, 'To-Do'),
          bucketBody(2, 'Doing'),
          bucketBody(3, 'Done'),
        ],
      }),
    )

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: true,
      value: [
        { id: 1, title: 'To-Do', isDone: false },
        { id: 2, title: 'Doing', isDone: false },
        { id: 3, title: 'Done', isDone: true },
      ],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops at the view when it cannot be read', async () => {
    stubPermissions(true)
    const fetchMock = stubFetch(() => jsonResponse(404, { message: 'no such view' }))

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: false,
      errorKey: 'notFound',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a fractional project id', { projectId: 1.5, viewId: 4 }],
    ['a negative view id', { projectId: 1, viewId: -4 }],
    ['a zero id', { projectId: 0, viewId: 4 }],
    ['NaN', { projectId: Number.NaN, viewId: 4 }],
  ])('refuses %s before it reaches a URL', async (_label, ids) => {
    stubPermissions(true)
    const fetchMock = stubFetch()

    await expect(handleVikunjaRequest({ ...request, ...ids })).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers permissionMissing without fetching', async () => {
    stubPermissions(false)
    const fetchMock = stubFetch()

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: false,
      errorKey: 'permissionMissing',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('listLabels', () => {
  const request = { type: 'vikunja', op: 'listLabels', cfg: CFG } as const

  it('summarises labels and normalises an empty colour to null', async () => {
    stubPermissions(true)
    stubFetch(
      routes({
        '/labels': [
          { id: 1, title: 'energy:1', hex_color: 'efbdeb' },
          { id: 2, title: 'work', hex_color: '' },
        ],
      }),
    )

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: true,
      value: [
        { id: 1, title: 'energy:1', hexColor: 'efbdeb' },
        { id: 2, title: 'work', hexColor: null },
      ],
    })
  })

  it('propagates a backend failure', async () => {
    stubPermissions(true)
    stubFetch(() => jsonResponse(429, {}))

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: false,
      errorKey: 'rateLimited',
    })
  })

  it('answers permissionMissing without fetching', async () => {
    stubPermissions(false)
    const fetchMock = stubFetch()

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: false,
      errorKey: 'permissionMissing',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('createBucket', () => {
  const request = {
    type: 'vikunja',
    op: 'createBucket',
    cfg: CFG,
    projectId: 1,
    viewId: 4,
    title: 'Struggle',
  } as const

  it('creates the column and reports it as a non-done bucket', async () => {
    stubPermissions(true)
    const fetchMock = stubFetch(() => jsonResponse(201, bucketBody(25, 'Struggle')))

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: true,
      value: { id: 25, title: 'Struggle', isDone: false },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an empty title', ''],
    ['a whitespace-only title', '   '],
    ['an absurdly long title', 'x'.repeat(251)],
  ])('refuses %s without fetching', async (_label, title) => {
    stubPermissions(true)
    const fetchMock = stubFetch()

    await expect(handleVikunjaRequest({ ...request, title })).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a missing bucket scope on the token to authInvalid', async () => {
    stubPermissions(true)
    stubFetch(() => jsonResponse(403, { message: 'forbidden' }))

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: false,
      errorKey: 'authInvalid',
    })
  })

  it('answers permissionMissing without fetching', async () => {
    stubPermissions(false)
    const fetchMock = stubFetch()

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: false,
      errorKey: 'permissionMissing',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('pull', () => {
  const request = { type: 'vikunja', op: 'pull', cfg: CFG, projectId: 1, viewId: 4 } as const

  it('flattens the buckets, keeps the bucket a task was found in and trims `updated`', async () => {
    stubPermissions(true)
    stubFetch(
      routes({
        '/projects/1/views/4/tasks': [
          { ...bucketBody(1, 'To-Do'), tasks: [taskBody({ labels: [] })] },
          {
            ...bucketBody(3, 'Done'),
            tasks: [
              taskBody({
                id: 5,
                done: true,
                done_at: '2026-09-20T14:58:54.988789804Z',
                labels: [{ id: 1, title: 'energy:1', hex_color: 'efbdeb' }],
              }),
            ],
          },
        ],
      }),
    )

    const out = await handleVikunjaRequest(request)

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    const value = out.value as { tasks: unknown[]; pulledAt: number }
    expect(value.tasks).toEqual([
      {
        id: 4,
        identifier: '#3',
        title: 'Probe',
        description: '<p>rich</p>',
        done: false,
        doneAt: null,
        bucketId: 1,
        created: '2026-09-20T17:00:00+03:00',
        // Nanoseconds gone: the etag has to match what the next GET answers.
        updated: '2026-09-20T14:57:12.000Z',
        labelIds: [],
      },
      {
        id: 5,
        identifier: '#3',
        title: 'Probe',
        description: '<p>rich</p>',
        done: true,
        doneAt: '2026-09-20T14:58:54.988789804Z',
        bucketId: 3,
        created: '2026-09-20T17:00:00+03:00',
        updated: '2026-09-20T14:57:12.000Z',
        labelIds: [1],
      },
    ])
    expect(value.pulledAt).toBeGreaterThan(0)
  })

  it('answers with an empty list for a board with no tasks', async () => {
    stubPermissions(true)
    stubFetch(routes({ '/projects/1/views/4/tasks': [bucketBody(1, 'To-Do')] }))

    await expect(handleVikunjaRequest(request)).resolves.toMatchObject({
      ok: true,
      value: { tasks: [] },
    })
  })

  it('propagates a backend failure', async () => {
    stubPermissions(true)
    stubFetch(() => jsonResponse(404, { message: 'gone' }))

    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: false,
      errorKey: 'notFound',
    })
  })

  it('refuses a malformed scope and answers permissionMissing without a grant', async () => {
    stubPermissions(true)
    const fetchMock = stubFetch()
    await expect(handleVikunjaRequest({ ...request, viewId: 0 })).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })

    stubPermissions(false)
    await expect(handleVikunjaRequest(request)).resolves.toEqual({
      ok: false,
      errorKey: 'permissionMissing',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
