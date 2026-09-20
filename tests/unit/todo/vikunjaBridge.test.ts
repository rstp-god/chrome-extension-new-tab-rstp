import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VikunjaRequest } from '@/background/vikunja/messages.ts'

import { sendVikunjaMessage } from '@/widgets/Todo/integrations/vikunja/bridge.ts'

/**
 * `isShowcaseMode` reads `import.meta.env` at call time; mocking it directly
 * keeps the showcase case explicit while `getChromeObject` stays real, so the
 * "no chrome object" case exercises the production lookup.
 */
const runtimeFlags = vi.hoisted(() => ({ showcase: false }))

vi.mock('@/services/chrome/runtime.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chrome/runtime.ts')>()
  return { ...actual, isShowcaseMode: () => runtimeFlags.showcase }
})

type SendMessage = (message: unknown, callback: (response?: unknown) => void) => void

const PING: VikunjaRequest = { type: 'vikunja', op: 'ping' }

function installChromeMock(sendMessage: SendMessage, lastError?: { message: string }): void {
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage, lastError },
  }
}

function removeChromeMock(): void {
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
}

beforeEach(() => {
  runtimeFlags.showcase = false
})

afterEach(() => {
  removeChromeMock()
})

describe('sendVikunjaMessage', () => {
  it('resolves with the worker payload on a valid ok envelope', async () => {
    const sendMessage = vi.fn<SendMessage>((_message, callback) => {
      callback({ ok: true, value: { pong: true, at: 42 } })
    })
    installChromeMock(sendMessage)

    const result = await sendVikunjaMessage<{ pong: boolean; at: number }>(PING)

    expect(sendMessage).toHaveBeenCalledWith(PING, expect.any(Function))
    expect(result).toEqual({ ok: true, value: { pong: true, at: 42 } })
  })

  it('passes a worker-reported error key through unchanged', async () => {
    installChromeMock((_message, callback) => {
      callback({ ok: false, errorKey: 'authInvalid' })
    })

    await expect(sendVikunjaMessage(PING)).resolves.toEqual({ ok: false, errorKey: 'authInvalid' })
  })

  it('maps chrome.runtime.lastError to network', async () => {
    installChromeMock(
      (_message, callback) => {
        callback(undefined)
      },
      { message: 'Could not establish connection.' },
    )

    await expect(sendVikunjaMessage(PING)).resolves.toEqual({ ok: false, errorKey: 'network' })
  })

  it('maps a missing chrome object to network', async () => {
    removeChromeMock()

    await expect(sendVikunjaMessage(PING)).resolves.toEqual({ ok: false, errorKey: 'network' })
  })

  it('maps a chrome object without runtime.sendMessage to network', async () => {
    ;(globalThis as unknown as { chrome: unknown }).chrome = { runtime: {} }

    await expect(sendVikunjaMessage(PING)).resolves.toEqual({ ok: false, errorKey: 'network' })
  })

  it('short-circuits to network in showcase mode without touching chrome', async () => {
    runtimeFlags.showcase = true
    const sendMessage = vi.fn<SendMessage>((_message, callback) => {
      callback({ ok: true, value: null })
    })
    installChromeMock(sendMessage)

    await expect(sendVikunjaMessage(PING)).resolves.toEqual({ ok: false, errorKey: 'network' })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it.each([
    ['undefined (no listener answered)', undefined],
    ['a foreign shape', { status: 'fine' }],
    ['an unknown error key', { ok: false, errorKey: 'teapot' }],
    ['a non-object', 'ok'],
  ])('maps %s to unknown', async (_label, raw) => {
    installChromeMock((_message, callback) => {
      callback(raw)
    })

    await expect(sendVikunjaMessage(PING)).resolves.toEqual({ ok: false, errorKey: 'unknown' })
  })

  it('maps a synchronous throw from sendMessage to network', async () => {
    installChromeMock(() => {
      throw new Error('Extension context invalidated.')
    })

    await expect(sendVikunjaMessage(PING)).resolves.toEqual({ ok: false, errorKey: 'network' })
  })
})
