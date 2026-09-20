import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleVikunjaRequest, vikunjaWireSchema } from '@/background/vikunja/handlers.ts'

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
