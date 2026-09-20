import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VikunjaClient } from '@/background/vikunja/client.ts'
import { VIKUNJA_BACKOFF_MS, VIKUNJA_REQUEST_TIMEOUT_MS } from '@/background/vikunja/constants.ts'

const BASE_URL = 'https://vikunja.example'
const TOKEN = 'tk_super-secret-value'
const INFO_URL = 'https://vikunja.example/api/v1/info'

const INFO_BODY = { version: 'v2.6.0', max_items_per_page: 50, task_comments_enabled: true }
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
