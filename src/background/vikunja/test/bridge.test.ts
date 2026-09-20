import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VikunjaRequest } from '@/background/vikunja/messages.ts'

import { handleVikunjaRequest, setupVikunjaBridge } from '@/background/vikunja/index.ts'

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined

const listeners: Listener[] = []

function installChromeMock(): void {
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      onMessage: {
        addListener: (listener: Listener) => {
          listeners.push(listener)
        },
      },
    },
  }
}

/** Registers the bridge and hands back the listener it attached. */
function attachBridge(): Listener {
  setupVikunjaBridge()
  const listener = listeners.at(-1)
  if (!listener) throw new Error('setupVikunjaBridge registered no listener')
  return listener
}

/** Lets the dispatch promise settle before assertions run. */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  listeners.length = 0
  installChromeMock()
})

afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
})

describe('handleVikunjaRequest', () => {
  it('answers ping with a timestamped pong', async () => {
    const response = await handleVikunjaRequest({ type: 'vikunja', op: 'ping' })

    expect(response.ok).toBe(true)
    if (!response.ok) return
    expect(response.value).toMatchObject({ pong: true })
    expect(typeof (response.value as { at: unknown }).at).toBe('number')
  })

  it('answers a known but not-yet-implemented op with unknown', async () => {
    const response = await handleVikunjaRequest({
      type: 'vikunja',
      op: 'listProjects',
      cfg: { baseUrl: 'https://vikunja.example', token: 'super-secret' },
    })

    expect(response).toEqual({ ok: false, errorKey: 'unknown' })
  })

  it('answers an op outside the union with unknown', async () => {
    const bogus = { type: 'vikunja', op: 'teleport' } as unknown as VikunjaRequest

    await expect(handleVikunjaRequest(bogus)).resolves.toEqual({ ok: false, errorKey: 'unknown' })
  })
})

describe('setupVikunjaBridge', () => {
  it('ignores foreign messages so the other listener can answer', async () => {
    const listener = attachBridge()
    const sendResponse = vi.fn()

    const result = listener({ type: 'GET_STATUS' }, {}, sendResponse)
    await flush()

    expect(result).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('ignores non-object messages', async () => {
    const listener = attachBridge()
    const sendResponse = vi.fn()

    expect(listener('vikunja', {}, sendResponse)).toBe(false)
    expect(listener(null, {}, sendResponse)).toBe(false)
    await flush()

    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('keeps the channel open and responds to ping asynchronously', async () => {
    const listener = attachBridge()
    const sendResponse = vi.fn()

    const result = listener({ type: 'vikunja', op: 'ping' }, {}, sendResponse)

    expect(result).toBe(true)
    expect(sendResponse).not.toHaveBeenCalled()

    await flush()

    expect(sendResponse).toHaveBeenCalledTimes(1)
    const [response] = sendResponse.mock.calls[0] as [{ ok: boolean; value: { pong: boolean } }]
    expect(response.ok).toBe(true)
    expect(response.value.pong).toBe(true)
  })

  it('turns a thrown dispatch into unknown and never logs the token', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock exploded')
    })

    const listener = attachBridge()
    const sendResponse = vi.fn()

    listener(
      {
        type: 'vikunja',
        op: 'ping',
        cfg: { baseUrl: 'https://vikunja.example', token: 'super-secret' },
      },
      {},
      sendResponse,
    )
    await flush()

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, errorKey: 'unknown' })
    expect(consoleError).toHaveBeenCalled()

    const logged = JSON.stringify(consoleError.mock.calls)
    expect(logged).toContain('[vikunja]')
    expect(logged).not.toContain('super-secret')
    expect(logged).not.toContain('baseUrl')
  })
})
