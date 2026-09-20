import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleVikunjaRequest, setupVikunjaBridge } from '@/background/vikunja/index.ts'

import type { VikunjaPing, VikunjaRequest } from '@/background/vikunja/messages.ts'

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined

const listeners: Listener[] = []

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop'
const EXTENSION_ROOT = `chrome-extension://${EXTENSION_ID}/`

/**
 * A message from one of our own extension pages — the only sender the bridge
 * answers. The New Tab page is a tab, so `tab` is present on purpose: the
 * guard must key on the URL, not on the absence of a tab.
 */
const TRUSTED_SENDER = {
  id: EXTENSION_ID,
  url: `${EXTENSION_ROOT}src/newtab/index.html`,
  tab: { id: 7 },
}

function installChromeMock(): void {
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      id: EXTENSION_ID,
      getURL: (path: string) => `${EXTENSION_ROOT}${path}`,
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
  await new Promise((resolve) => setTimeout(resolve, 0))
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
    const value = response.value as VikunjaPing
    expect(value.pong).toBe(true)
    expect(typeof value.at).toBe('number')
  })

  it('answers a known but not-yet-implemented op with unknown', async () => {
    const response = await handleVikunjaRequest({
      type: 'vikunja',
      op: 'listProjects',
      cfg: { baseUrl: 'https://vikunja.example', token: 'super-secret' },
    })

    expect(response).toEqual({ ok: false, errorKey: 'unknown' })
  })

  it('keeps a default branch for an op outside the union', async () => {
    const bogus = { type: 'vikunja', op: 'teleport' } as unknown as VikunjaRequest

    await expect(handleVikunjaRequest(bogus)).resolves.toEqual({ ok: false, errorKey: 'unknown' })
  })
})

describe('setupVikunjaBridge', () => {
  it('ignores foreign messages so the other listener can answer', async () => {
    const listener = attachBridge()
    const sendResponse = vi.fn()

    const result = listener({ type: 'GET_STATUS' }, TRUSTED_SENDER, sendResponse)
    await flush()

    expect(result).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('ignores non-object messages', async () => {
    const listener = attachBridge()
    const sendResponse = vi.fn()

    expect(listener('vikunja', TRUSTED_SENDER, sendResponse)).toBe(false)
    expect(listener(null, TRUSTED_SENDER, sendResponse)).toBe(false)
    await flush()

    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('ignores a vikunja message carrying an op outside the allowlist', async () => {
    const listener = attachBridge()
    const sendResponse = vi.fn()

    const result = listener({ type: 'vikunja', op: 'teleport' }, TRUSTED_SENDER, sendResponse)
    await flush()

    expect(result).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('answers a message from one of our own extension pages', async () => {
    const listener = attachBridge()
    const sendResponse = vi.fn()

    expect(listener({ type: 'vikunja', op: 'ping' }, TRUSTED_SENDER, sendResponse)).toBe(true)
    await flush()

    expect(sendResponse).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a content script on a web page', { id: EXTENSION_ID, url: 'https://evil.example/page' }],
    ['another extension', { id: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', url: EXTENSION_ROOT }],
    ['a sender with no url at all', { id: EXTENSION_ID }],
    ['a sender with no id at all', { url: `${EXTENSION_ROOT}src/newtab/index.html` }],
    [
      'a url that only looks like ours',
      { id: EXTENSION_ID, url: 'https://evil.example/chrome-extension://x/' },
    ],
  ])('stays silent for %s', async (_label, sender) => {
    const listener = attachBridge()
    const sendResponse = vi.fn()

    const result = listener({ type: 'vikunja', op: 'ping' }, sender, sendResponse)
    await flush()

    expect(result).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('keeps the channel open and responds to ping asynchronously', async () => {
    const listener = attachBridge()
    const sendResponse = vi.fn()

    const result = listener({ type: 'vikunja', op: 'ping' }, TRUSTED_SENDER, sendResponse)

    expect(result).toBe(true)
    expect(sendResponse).not.toHaveBeenCalled()

    await flush()

    expect(sendResponse).toHaveBeenCalledTimes(1)
    const [response] = sendResponse.mock.calls[0] as [{ ok: boolean; value: VikunjaPing }]
    expect(response.ok).toBe(true)
    expect(response.value.pong).toBe(true)
  })

  it('swallows a sendResponse that throws because the port is gone', async () => {
    const rejections: unknown[] = []
    const onRejection = (reason: unknown) => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onRejection)

    try {
      const listener = attachBridge()
      const sendResponse = vi.fn(() => {
        throw new Error('Attempting to use a disconnected port object')
      })

      expect(listener({ type: 'vikunja', op: 'ping' }, TRUSTED_SENDER, sendResponse)).toBe(true)
      await flush()

      expect(sendResponse).toHaveBeenCalledTimes(1)
      expect(rejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onRejection)
    }
  })

  it('turns a thrown dispatch into unknown and never logs the token', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock exploded at https://vikunja.example')
    })

    const listener = attachBridge()
    const sendResponse = vi.fn()

    listener(
      {
        type: 'vikunja',
        op: 'ping',
        cfg: { baseUrl: 'https://vikunja.example', token: 'super-secret' },
      },
      TRUSTED_SENDER,
      sendResponse,
    )
    await flush()

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, errorKey: 'unknown' })
    expect(consoleError).toHaveBeenCalled()

    const logged = JSON.stringify(consoleError.mock.calls)
    expect(logged).toContain('[vikunja]')
    expect(logged).toContain('Error')
    expect(logged).not.toContain('super-secret')
    expect(logged).not.toContain('vikunja.example')
  })
})
