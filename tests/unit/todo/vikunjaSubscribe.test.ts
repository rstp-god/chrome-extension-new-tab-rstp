import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { subscribeVikunjaRemoteChanges } from '@/widgets/Todo/integrations/vikunja/subscribe.ts'

import type { RemoteChangeEvent } from '@/widgets/Todo/integrations/types.ts'

/**
 * Same shape as `vikunjaBridge.test.ts`: `isShowcaseMode` reads
 * `import.meta.env` at call time, so it is mocked explicitly while
 * `getChromeObject` stays real and the "no chrome object" case exercises the
 * production lookup.
 */
const runtimeFlags = vi.hoisted(() => ({ showcase: false }))

vi.mock('@/services/chrome/runtime.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chrome/runtime.ts')>()
  return { ...actual, isShowcaseMode: () => runtimeFlags.showcase }
})

type Sender = chrome.runtime.MessageSender
type Listener = (message: unknown, sender: Sender) => void

const SCOPE = { projectId: 1, viewId: 4 }
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop'
const EXTENSION_ROOT = `chrome-extension://${EXTENSION_ID}/`

/** The service worker: our id, and no `url` at all. */
const WORKER_SENDER: Sender = { id: EXTENSION_ID }

const PULLED = {
  type: 'vikunja/pulled',
  projectId: 1,
  viewId: 4,
  at: 1_700_000_000_000,
  // Counts, not ids — the ids never leave the worker.
  delta: { added: 1, changed: 0, removed: 0 },
}

function installChromeMock() {
  const listeners = new Set<Listener>()
  const addListener = vi.fn((listener: Listener) => listeners.add(listener))
  const removeListener = vi.fn((listener: Listener) => listeners.delete(listener))

  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      id: EXTENSION_ID,
      getURL: (path: string) => `${EXTENSION_ROOT}${path}`,
      onMessage: { addListener, removeListener },
    },
  }

  return {
    addListener,
    removeListener,
    /** Play the worker: hand every registered listener one message. */
    emit: (message: unknown, sender: Sender = WORKER_SENDER) => {
      for (const listener of [...listeners]) listener(message, sender)
    },
    size: () => listeners.size,
  }
}

function collect() {
  const events: RemoteChangeEvent[] = []
  return { events, onEvent: (event: RemoteChangeEvent) => events.push(event) }
}

beforeEach(() => {
  runtimeFlags.showcase = false
})

afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
})

describe('subscribeVikunjaRemoteChanges', () => {
  it('registers a listener and removes it on unsubscribe', () => {
    const chromeMock = installChromeMock()
    const { onEvent } = collect()

    const unsubscribe = subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    expect(chromeMock.addListener).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(chromeMock.removeListener).toHaveBeenCalledTimes(1)
    expect(chromeMock.size()).toBe(0)
  })

  it('maps vikunja/pulled to a `changed` event', () => {
    const chromeMock = installChromeMock()
    const { events, onEvent } = collect()
    subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    chromeMock.emit(PULLED)

    expect(events).toEqual([{ kind: 'changed' }])
  })

  it('maps vikunja/pull-failed to a `failed` event carrying the error key', () => {
    const chromeMock = installChromeMock()
    const { events, onEvent } = collect()
    subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    chromeMock.emit({
      type: 'vikunja/pull-failed',
      projectId: 1,
      viewId: 4,
      at: 1,
      errorKey: 'authInvalid',
    })

    expect(events).toEqual([{ kind: 'failed', errorKey: 'authInvalid' }])
  })

  it('stops reporting once unsubscribed', () => {
    const chromeMock = installChromeMock()
    const { events, onEvent } = collect()

    subscribeVikunjaRemoteChanges(SCOPE, onEvent)()
    chromeMock.emit(PULLED)

    expect(events).toEqual([])
  })

  it.each([
    ['another project', { ...PULLED, projectId: 2 }],
    ['another view of the same project', { ...PULLED, viewId: 9 }],
  ])('ignores a broadcast about %s', (_label, message) => {
    const chromeMock = installChromeMock()
    const { events, onEvent } = collect()
    subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    chromeMock.emit(message)

    expect(events).toEqual([])
  })

  it.each([
    ['a foreign message on the shared channel', { type: 'GET_STATUS' }],
    ['a bridge request rather than a broadcast', { type: 'vikunja', op: 'ping' }],
    ['a malformed broadcast', { type: 'vikunja/pulled', projectId: '1', viewId: 4, at: 1 }],
    ['a broadcast with no delta', { type: 'vikunja/pulled', projectId: 1, viewId: 4, at: 1 }],
    [
      'a delta of ids rather than counts',
      { ...PULLED, delta: { added: [4], changed: [], removed: [] } },
    ],
    [
      'a failure with an error key we do not know',
      { type: 'vikunja/pull-failed', projectId: 1, viewId: 4, at: 1, errorKey: 'whatever' },
    ],
    ['null', null],
    ['a string', 'vikunja/pulled'],
  ])('ignores %s', (_label, message) => {
    const chromeMock = installChromeMock()
    const { events, onEvent } = collect()
    subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    chromeMock.emit(message)

    expect(events).toEqual([])
  })

  it('accepts a scope whose ids arrived as strings', () => {
    const chromeMock = installChromeMock()
    const { events, onEvent } = collect()
    subscribeVikunjaRemoteChanges({ projectId: '1', viewId: '4' }, onEvent)

    chromeMock.emit(PULLED)

    expect(events).toEqual([{ kind: 'changed' }])
  })

  it('is a no-op for a scope that addresses nothing', () => {
    const chromeMock = installChromeMock()
    const { onEvent } = collect()

    const unsubscribe = subscribeVikunjaRemoteChanges({ projectId: 0 }, onEvent)

    expect(chromeMock.addListener).not.toHaveBeenCalled()
    expect(() => unsubscribe()).not.toThrow()
  })

  it('is a no-op in the showcase build', () => {
    const chromeMock = installChromeMock()
    runtimeFlags.showcase = true
    const { onEvent } = collect()

    subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    expect(chromeMock.addListener).not.toHaveBeenCalled()
  })

  it('is a no-op without chrome.runtime.onMessage', () => {
    Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
    const { onEvent } = collect()

    expect(() => subscribeVikunjaRemoteChanges(SCOPE, onEvent)()).not.toThrow()
  })

  it('never answers the message, so the response channel stays free', () => {
    const chromeMock = installChromeMock()
    const { onEvent } = collect()
    subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    const listener = chromeMock.addListener.mock.calls[0][0] as (
      message: unknown,
      sender: Sender,
    ) => unknown

    // A truthy return would hold the port open and starve the listener that
    // actually answers `chrome.runtime.sendMessage`.
    expect(listener(PULLED, WORKER_SENDER)).toBeUndefined()
  })
})

describe('subscribeVikunjaRemoteChanges — who is allowed to say it', () => {
  it('accepts the service worker, which sends no url', () => {
    const chromeMock = installChromeMock()
    const { events, onEvent } = collect()
    subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    chromeMock.emit(PULLED, { id: EXTENSION_ID })

    expect(events).toEqual([{ kind: 'changed' }])
  })

  it('accepts another page of this same extension', () => {
    const chromeMock = installChromeMock()
    const { events, onEvent } = collect()
    subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    chromeMock.emit(PULLED, { id: EXTENSION_ID, url: `${EXTENSION_ROOT}src/newtab/index.html` })

    expect(events).toEqual([{ kind: 'changed' }])
  })

  it.each([
    ['another extension', { id: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz' }],
    ['no id at all', {}],
    ['our id but a web origin', { id: EXTENSION_ID, url: 'https://evil.example/page' }],
    [
      'a url that merely starts like ours',
      { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}.evil.example/x` },
    ],
  ])('rejects a broadcast from %s', (_label, sender) => {
    const chromeMock = installChromeMock()
    const { events, onEvent } = collect()
    subscribeVikunjaRemoteChanges(SCOPE, onEvent)

    chromeMock.emit(PULLED, sender as Sender)

    expect(events).toEqual([])
  })
})
