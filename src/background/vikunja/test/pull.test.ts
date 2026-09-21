import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readSnapshot, snapshotKey, writeSnapshot } from '@/background/vikunja/cache.ts'
import { VIKUNJA_BACKOFF_MS, VIKUNJA_SNAPSHOT_FRESH_MS } from '@/background/vikunja/constants.ts'
import { computeDelta, isEmptyDelta, runPull } from '@/background/vikunja/pull.ts'

import type { VikunjaPulledTask, VikunjaPullResult } from '@/background/vikunja/messages.ts'

const CFG = { baseUrl: 'https://vikunja.example', token: 'tk_super-secret-value' }

function task(overrides: Partial<VikunjaPulledTask> = {}): VikunjaPulledTask {
  return {
    id: 4,
    identifier: '#3',
    title: 'Probe',
    description: '<p>rich</p>',
    done: false,
    doneAt: null,
    bucketId: 1,
    created: '2026-09-20T14:00:00.000Z',
    updated: '2026-09-20T14:57:12.000Z',
    labelIds: [],
    ...overrides,
  }
}

/**
 * One raw task as the view endpoint answers it. Fully shaped on purpose: the
 * client's schema is loose but not partial, and a body missing a field is a
 * parse failure rather than a task with defaults.
 */
function taskBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    identifier: '#3',
    index: 3,
    project_id: 1,
    // `0` everywhere but inside a view response — the pull must ignore it.
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

function bucketBody(id: number, tasks: Record<string, unknown>[]) {
  return { id, title: `Bucket ${id}`, project_view_id: 4, position: id * 100, limit: 0, tasks }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(responder: (url: string) => Response) {
  const fetchMock = vi.fn(async (url: string) => responder(url))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The happy instance: one bucket holding `bodies`. */
function stubView(bodies: Record<string, unknown>[] = [taskBody()]) {
  return stubFetch(() => jsonResponse(200, [bucketBody(1, bodies)]))
}

function installChrome(granted: boolean, seed: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(seed))
  const sent: unknown[] = []
  const local = {
    get: vi.fn(async (key: string | null) =>
      key === null ? Object.fromEntries(store) : store.has(key) ? { [key]: store.get(key) } : {},
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) store.set(key, value)
    }),
    remove: vi.fn(async () => {}),
  }
  // The read path broadcasts what it found, whoever started it — so every
  // test here can see it.
  const sendMessage = vi.fn((message: unknown) => {
    sent.push(message)
  })

  Object.defineProperty(globalThis, 'chrome', {
    value: {
      permissions: { contains: vi.fn(async () => granted) },
      storage: { local },
      runtime: { sendMessage },
    },
    configurable: true,
  })

  return { store, local, sent, sendMessage }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
})

describe('computeDelta', () => {
  it('reports every task as added when there is no previous snapshot', () => {
    const delta = computeDelta(null, [task({ id: 1 }), task({ id: 2 })])

    expect(delta).toEqual({ added: [1, 2], changed: [], removed: [] })
  })

  it('answers an empty delta for two identical reads', () => {
    const before = [task({ id: 1 }), task({ id: 2 })]

    const delta = computeDelta(before, [task({ id: 1 }), task({ id: 2 })])

    expect(delta).toEqual({ added: [], changed: [], removed: [] })
    expect(isEmptyDelta(delta)).toBe(true)
  })

  it('reports a task the previous read did not have as added', () => {
    const delta = computeDelta([task({ id: 1 })], [task({ id: 1 }), task({ id: 2 })])

    expect(delta).toEqual({ added: [2], changed: [], removed: [] })
  })

  it('reports a newer `updated` as changed', () => {
    const delta = computeDelta(
      [task({ id: 1, updated: '2026-09-20T14:57:12.000Z' })],
      [task({ id: 1, updated: '2026-09-20T15:00:00.000Z' })],
    )

    expect(delta).toEqual({ added: [], changed: [1], removed: [] })
  })

  it('reports a move between buckets as changed even when `updated` stands still', () => {
    const delta = computeDelta([task({ id: 1, bucketId: 1 })], [task({ id: 1, bucketId: 3 })])

    expect(delta).toEqual({ added: [], changed: [1], removed: [] })
  })

  it('reports a `done` flipped server-side as changed', () => {
    const delta = computeDelta([task({ id: 1, done: false })], [task({ id: 1, done: true })])

    expect(delta).toEqual({ added: [], changed: [1], removed: [] })
  })

  it('reports ids that vanished as removed — the deletion an incremental pull would miss', () => {
    const delta = computeDelta(
      [task({ id: 1 }), task({ id: 2 }), task({ id: 3 })],
      [task({ id: 2 })],
    )

    expect(delta).toEqual({ added: [], changed: [], removed: [1, 3] })
  })

  it('reports an emptied view as all-removed rather than as nothing', () => {
    expect(computeDelta([task({ id: 1 })], [])).toEqual({
      added: [],
      changed: [],
      removed: [1],
    })
  })

  it('an empty first pull is an empty delta, not an added list', () => {
    expect(isEmptyDelta(computeDelta(null, []))).toBe(true)
  })
})

describe('runPull: the snapshot short-circuit', () => {
  it('answers a fresh snapshot without touching the network', async () => {
    const fetchMock = stubView()
    installChrome(true)
    await writeSnapshot({ projectId: 1, viewId: 4, tasks: [task({ id: 7 })], pulledAt: Date.now() })

    const out = await runPull(CFG, 1, 4, {})

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value.tasks.map((t) => t.id)).toEqual([7])
    expect(isEmptyDelta(out.value.delta)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the view when the caller forces it, however fresh the snapshot', async () => {
    const fetchMock = stubView()
    installChrome(true)
    await writeSnapshot({ projectId: 1, viewId: 4, tasks: [task({ id: 7 })], pulledAt: Date.now() })

    const out = await runPull(CFG, 1, 4, { force: true })

    expect(fetchMock).toHaveBeenCalled()
    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    // The cached id is gone and the read one is in: id 7 was "removed", 4 added.
    expect(out.value.delta).toEqual({ added: [4], changed: [], removed: [7] })
  })

  it('reads the view when the snapshot has aged past the freshness window', async () => {
    const fetchMock = stubView()
    installChrome(true)
    await writeSnapshot({
      projectId: 1,
      viewId: 4,
      tasks: [task({ id: 7 })],
      pulledAt: Date.now() - VIKUNJA_SNAPSHOT_FRESH_MS - 1,
    })

    await runPull(CFG, 1, 4, {})

    expect(fetchMock).toHaveBeenCalled()
  })

  it('does not trust a snapshot stamped in the future', async () => {
    const fetchMock = stubView()
    installChrome(true)
    await writeSnapshot({
      projectId: 1,
      viewId: 4,
      tasks: [task({ id: 7 })],
      pulledAt: Date.now() + 60_000,
    })

    await runPull(CFG, 1, 4, {})

    expect(fetchMock).toHaveBeenCalled()
  })

  it('treats a corrupt snapshot as absent: it reads, and the delta is all-added', async () => {
    const fetchMock = stubView()
    installChrome(true, { [snapshotKey(1, 4)]: { projectId: 1, viewId: 4, tasks: 'nope' } })

    const out = await runPull(CFG, 1, 4, {})

    expect(fetchMock).toHaveBeenCalled()
    expect(out).toMatchObject({
      ok: true,
      value: { delta: { added: [4], changed: [], removed: [] } },
    })
  })
})

describe('runPull: the read', () => {
  it('flattens the buckets, keeps the bucket a task was found in and trims `updated`', async () => {
    installChrome(true)
    stubFetch(() =>
      jsonResponse(200, [
        bucketBody(1, [taskBody()]),
        bucketBody(3, [taskBody({ id: 5, done: true })]),
      ]),
    )

    const out = await runPull(CFG, 1, 4, { force: true })

    expect(out).toMatchObject({ ok: true })
    if (!out.ok) return
    expect(out.value.tasks).toEqual([
      expect.objectContaining({ id: 4, bucketId: 1, updated: '2026-09-20T14:57:12.000Z' }),
      expect.objectContaining({ id: 5, bucketId: 3, done: true }),
    ])
    expect(out.value.pulledAt).toBeGreaterThan(0)
  })

  it('writes the snapshot it read, and reads it back validated', async () => {
    installChrome(true)
    stubView()

    const out = (await runPull(CFG, 1, 4, { force: true })) as {
      ok: true
      value: VikunjaPullResult
    }

    await expect(readSnapshot(1, 4)).resolves.toEqual({
      projectId: 1,
      viewId: 4,
      tasks: out.value.tasks,
      pulledAt: out.value.pulledAt,
    })
  })

  it('computes the delta against the snapshot of the same view only', async () => {
    installChrome(true)
    stubView()
    // A snapshot of a *different* view must not make our tasks look changed.
    await writeSnapshot({ projectId: 9, viewId: 9, tasks: [task({ id: 4 })], pulledAt: 1 })

    const out = await runPull(CFG, 1, 4, { force: true })

    expect(out).toMatchObject({ ok: true, value: { delta: { added: [4] } } })
  })

  it('refuses a scope that is not a pair of positive ints, without fetching', async () => {
    const fetchMock = stubView()
    installChrome(true)

    await expect(runPull(CFG, 0, 4, { force: true })).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
    await expect(runPull(CFG, 1, 1.5, { force: true })).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('runPull: failures', () => {
  it('answers permissionMissing without a single request when the host is not granted', async () => {
    const fetchMock = stubView()
    installChrome(false)

    await expect(runPull(CFG, 1, 4, { force: true })).resolves.toEqual({
      ok: false,
      errorKey: 'permissionMissing',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers unknown for a config the gate refuses, without a request', async () => {
    const fetchMock = stubView()
    installChrome(true)

    await expect(
      runPull({ baseUrl: 'http://vikunja.example', token: 'x' }, 1, 4, { force: true }),
    ).resolves.toEqual({ ok: false, errorKey: 'unknown' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a 401 to authInvalid and does not retry it', async () => {
    installChrome(true)
    const fetchMock = stubFetch(() => jsonResponse(401, { message: 'invalid token' }))

    await expect(runPull(CFG, 1, 4, { force: true })).resolves.toEqual({
      ok: false,
      errorKey: 'authInvalid',
    })
    // A 4xx is the server's considered answer: one request, no backoff.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves the snapshot untouched when the read fails', async () => {
    installChrome(true)
    const kept = { projectId: 1, viewId: 4, tasks: [task({ id: 7 })], pulledAt: 1 }
    await writeSnapshot(kept)
    stubFetch(() => jsonResponse(401, {}))

    await runPull(CFG, 1, 4, { force: true })

    await expect(readSnapshot(1, 4)).resolves.toEqual(kept)
  })

  it('retries a 5xx on the documented backoff schedule and then reports network', async () => {
    vi.useFakeTimers()
    try {
      installChrome(true)
      const fetchMock = stubFetch(() => jsonResponse(503, { message: 'restarting' }))

      const pending = runPull(CFG, 1, 4, { force: true })

      // The original attempt goes out immediately…
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // …and each retry only after its own delay has fully elapsed.
      for (const [index, ms] of VIKUNJA_BACKOFF_MS.entries()) {
        await vi.advanceTimersByTimeAsync(ms - 1)
        expect(fetchMock).toHaveBeenCalledTimes(index + 1)
        await vi.advanceTimersByTimeAsync(1)
        expect(fetchMock).toHaveBeenCalledTimes(index + 2)
      }

      await expect(pending).resolves.toEqual({ ok: false, errorKey: 'network' })
      expect(fetchMock).toHaveBeenCalledTimes(VIKUNJA_BACKOFF_MS.length + 1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('runPull: announcing what it found', () => {
  it('broadcasts a non-empty delta as counts, whoever started the read', async () => {
    const chromeMock = installChrome(true)
    stubView()

    // "Tab A" syncing by hand — not the alarm. The other tabs still have to
    // hear about it, which is why the broadcast lives in the read path.
    await runPull(CFG, 1, 4, { force: true })

    expect(chromeMock.sent).toEqual([
      {
        type: 'vikunja/pulled',
        projectId: 1,
        viewId: 4,
        at: expect.any(Number),
        // Counts, not ids: no page has a use for the ids.
        delta: { added: 1, changed: 0, removed: 0 },
      },
    ])
  })

  it('stays quiet when a real read found nothing new', async () => {
    const chromeMock = installChrome(true)
    stubView()
    await writeSnapshot({ projectId: 1, viewId: 4, tasks: [task()], pulledAt: 1 })

    await runPull(CFG, 1, 4, { force: true })

    expect(chromeMock.sent).toEqual([])
  })

  it('does not broadcast a cache hit — nothing was read, so nothing was observed', async () => {
    const chromeMock = installChrome(true)
    stubView()
    await writeSnapshot({ projectId: 1, viewId: 4, tasks: [task({ id: 7 })], pulledAt: Date.now() })

    await runPull(CFG, 1, 4, {})

    expect(chromeMock.sent).toEqual([])
  })

  it('the tab woken by a broadcast reads nothing and broadcasts nothing — no loop', async () => {
    const chromeMock = installChrome(true)
    const fetchMock = stubView()

    // Tab A, forced: one read, one broadcast.
    await runPull(CFG, 1, 4, { force: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(chromeMock.sent).toHaveLength(1)

    // Tab B reacting to that broadcast: a silent sync pulls unforced, lands
    // inside the freshness window of the snapshot the read just wrote, and so
    // makes no request — which is what makes the broadcast terminate.
    const echo = await runPull(CFG, 1, 4, { force: false })

    expect(echo).toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(chromeMock.sent).toHaveLength(1)
  })

  it('never puts the token, the host or a task title on the wire', async () => {
    const chromeMock = installChrome(true)
    stubFetch(() => jsonResponse(200, [bucketBody(1, [taskBody({ title: 'private thing' })])]))

    await runPull(CFG, 1, 4, { force: true })

    const serialised = JSON.stringify(chromeMock.sent)
    expect(serialised).not.toContain(CFG.token)
    expect(serialised).not.toContain('vikunja.example')
    expect(serialised).not.toContain('private thing')
  })
})

describe('runPull: a snapshot that would not persist', () => {
  it('holds back the first-pull broadcast and warns once', async () => {
    const chromeMock = installChrome(true)
    chromeMock.local.set.mockRejectedValue(new Error('QuotaExceededError'))
    stubView()

    const out = await runPull(CFG, 1, 4, { force: true })

    expect(out).toMatchObject({ ok: true, value: { persisted: false } })
    // Otherwise every woken tab would read the instance for itself, see "no
    // previous snapshot" and broadcast again — a storm per open tab.
    expect(chromeMock.sent).toEqual([])
    expect(console.warn).toHaveBeenCalledWith('[vikunja] snapshot not persisted', {
      projectId: 1,
      viewId: 4,
    })
    expect(console.warn).toHaveBeenCalledTimes(2) // the write failure, then this
  })

  it('still broadcasts a later read: the woken tabs have the older snapshot to serve from', async () => {
    const chromeMock = installChrome(true)
    stubView()
    await writeSnapshot({ projectId: 1, viewId: 4, tasks: [task({ id: 7 })], pulledAt: 1 })
    chromeMock.local.set.mockRejectedValue(new Error('QuotaExceededError'))

    await runPull(CFG, 1, 4, { force: true })

    expect(chromeMock.sent).toEqual([
      expect.objectContaining({
        type: 'vikunja/pulled',
        delta: { added: 1, changed: 0, removed: 1 },
      }),
    ])
  })

  it('reports persisted: true for a cache hit, which wrote nothing', async () => {
    installChrome(true)
    stubView()
    await writeSnapshot({ projectId: 1, viewId: 4, tasks: [task()], pulledAt: Date.now() })

    await expect(runPull(CFG, 1, 4, {})).resolves.toMatchObject({
      ok: true,
      value: { persisted: true },
    })
  })
})

describe('runPull: one read per view at a time', () => {
  it('shares a single network read between two concurrent callers', async () => {
    installChrome(true)
    const fetchMock = stubView()

    // An alarm tick landing next to a widget's forced pull.
    const [first, second] = await Promise.all([
      runPull(CFG, 1, 4, { force: true }),
      runPull(CFG, 1, 4, { force: true }),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })

  it('lets a later caller read again once the first has settled', async () => {
    installChrome(true)
    const fetchMock = stubView()

    await runPull(CFG, 1, 4, { force: true })
    await runPull(CFG, 1, 4, { force: true })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not wedge the view when a read fails', async () => {
    installChrome(true)
    const fetchMock = stubFetch(() => jsonResponse(401, {}))

    await expect(runPull(CFG, 1, 4, { force: true })).resolves.toMatchObject({ ok: false })
    await expect(runPull(CFG, 1, 4, { force: true })).resolves.toMatchObject({ ok: false })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not serialise two different views', async () => {
    installChrome(true)
    const fetchMock = stubView()

    await Promise.all([runPull(CFG, 1, 4, { force: true }), runPull(CFG, 2, 9, { force: true })])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('runPull: the retry policy', () => {
  it('retries a 5xx by default — a page is waiting for the answer', async () => {
    vi.useFakeTimers()
    try {
      installChrome(true)
      const fetchMock = stubFetch(() => jsonResponse(503, {}))

      const pending = runPull(CFG, 1, 4, { force: true })
      await vi.advanceTimersByTimeAsync(60_000)

      await expect(pending).resolves.toEqual({ ok: false, errorKey: 'network' })
      expect(fetchMock).toHaveBeenCalledTimes(VIKUNJA_BACKOFF_MS.length + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('issues exactly one request per page with retry: false, and reports network', async () => {
    installChrome(true)
    const fetchMock = stubFetch(() => jsonResponse(503, {}))

    // The alarm path: no waiting inside a worker Chrome may unload, because
    // the next tick is the retry.
    await expect(runPull(CFG, 1, 4, { force: true, retry: false })).resolves.toEqual({
      ok: false,
      errorKey: 'network',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
