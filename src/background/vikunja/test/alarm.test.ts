import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ensureAlarm,
  readVikunjaScheduleFromStorage,
  setupVikunjaPull,
} from '@/background/vikunja/alarm.ts'
import { snapshotKey } from '@/background/vikunja/cache.ts'
import {
  VIKUNJA_PULL_ALARM,
  VIKUNJA_PULL_PERIOD_MIN,
  VIKUNJA_TODO_STORAGE_KEY,
} from '@/background/vikunja/constants.ts'

import type { VikunjaPulledTask } from '@/background/vikunja/messages.ts'

const CONFIG = {
  baseUrl: 'https://vikunja.example',
  token: 'tk_super-secret-value',
  projectId: 1,
  viewId: 4,
  kanbanMapping: true,
}

const MAPPING = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['2'],
  completed: ['3'],
  deleted: ['4'],
}

/** The Todo widget's envelope as `withChromeSync` writes it. */
function envelope(integration: unknown) {
  return {
    meta: { originId: 'test', rev: 1, ts: 1_700_000_000_000 },
    state: { tasks: [], integration },
  }
}

function vikunjaEnvelope(overrides: Record<string, unknown> = {}) {
  return envelope({
    name: 'vikunja',
    config: CONFIG,
    boardName: 'Probe',
    lists: [],
    projects: [],
    mapping: MAPPING,
    lastSyncAt: null,
    ...overrides,
  })
}

function trelloEnvelope() {
  return envelope({
    name: 'trello',
    config: { apiKey: 'k', token: 't', boardId: 'b' },
    boardName: 'Board',
    lists: [],
    projects: [],
    mapping: MAPPING,
    lastSyncAt: null,
  })
}

function pulledTask(overrides: Partial<VikunjaPulledTask> = {}): VikunjaPulledTask {
  return {
    id: 4,
    identifier: '#3',
    title: 'Probe',
    description: '',
    done: false,
    doneAt: null,
    bucketId: 1,
    created: '2026-09-20T14:00:00.000Z',
    updated: '2026-09-20T14:57:12.000Z',
    labelIds: [],
    ...overrides,
  }
}

function taskBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    identifier: '#3',
    index: 3,
    project_id: 1,
    bucket_id: 0,
    title: 'Probe',
    description: '',
    done: false,
    done_at: '0001-01-01T00:00:00Z',
    due_date: '0001-01-01T00:00:00Z',
    start_date: '0001-01-01T00:00:00Z',
    end_date: '0001-01-01T00:00:00Z',
    priority: 0,
    percent_done: 0,
    created: '2026-09-20T14:00:00.000Z',
    updated: '2026-09-20T14:57:12.000Z',
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface Harness {
  store: Map<string, unknown>
  alarms: Map<string, chrome.alarms.Alarm>
  /** Every broadcast `chrome.runtime.sendMessage` was handed. */
  sent: unknown[]
  fire: (name?: string) => Promise<void>
  change: (key: string) => Promise<void>
  settle: () => Promise<void>
  alarmCreate: ReturnType<typeof vi.fn>
  alarmClear: ReturnType<typeof vi.fn>
  sendMessage: ReturnType<typeof vi.fn>
  onAlarmAdd: ReturnType<typeof vi.fn>
  onChangedAdd: ReturnType<typeof vi.fn>
}

/**
 * A `chrome` with the four APIs the alarm path touches, plus the two hooks a
 * test needs to play the browser: `fire` dispatches an alarm to whatever
 * listener was registered, `change` a storage event.
 */
function installChrome(
  options: {
    seed?: Record<string, unknown>
    granted?: boolean
    sendMessageImpl?: (message: unknown) => unknown
  } = {},
): Harness {
  const store = new Map<string, unknown>(Object.entries(options.seed ?? {}))
  const alarms = new Map<string, chrome.alarms.Alarm>()
  const sent: unknown[] = []

  const alarmListeners: ((alarm: chrome.alarms.Alarm) => void)[] = []
  const changeListeners: ((changes: Record<string, unknown>, area: string) => void)[] = []

  const onAlarmAdd = vi.fn((listener: (alarm: chrome.alarms.Alarm) => void) => {
    alarmListeners.push(listener)
  })
  const onChangedAdd = vi.fn(
    (listener: (changes: Record<string, unknown>, area: string) => void) => {
      changeListeners.push(listener)
    },
  )

  const alarmCreate = vi.fn((name: string, info: chrome.alarms.AlarmCreateInfo) => {
    alarms.set(name, {
      name,
      periodInMinutes: info.periodInMinutes,
      scheduledTime: 0,
    } as chrome.alarms.Alarm)
  })
  const alarmClear = vi.fn(async (name: string) => alarms.delete(name))

  const sendMessage = vi.fn((message: unknown) => {
    sent.push(message)
    return options.sendMessageImpl?.(message)
  })

  Object.defineProperty(globalThis, 'chrome', {
    value: {
      alarms: {
        create: alarmCreate,
        clear: alarmClear,
        get: vi.fn(async (name: string) => alarms.get(name)),
        onAlarm: { addListener: onAlarmAdd },
      },
      storage: {
        local: {
          get: vi.fn(async (key: string | null) =>
            key === null
              ? Object.fromEntries(store)
              : store.has(key)
                ? { [key]: store.get(key) }
                : {},
          ),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(items)) store.set(key, value)
          }),
          remove: vi.fn(async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key)
          }),
        },
        onChanged: { addListener: onChangedAdd },
      },
      permissions: { contains: vi.fn(async () => options.granted ?? true) },
      runtime: { sendMessage },
    },
    configurable: true,
  })

  /**
   * Let the handlers — which are `void`-dispatched promises — settle.
   * Fake-timer aware, because the backoff tests install them and a real
   * `setTimeout` would then never fire.
   */
  const settle = async () => {
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(10)
      return
    }
    for (let hop = 0; hop < 4; hop += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  /** Dispatch an alarm and let the (async) handler settle. */
  const fire = async (name = VIKUNJA_PULL_ALARM) => {
    for (const listener of alarmListeners) {
      listener({ name, scheduledTime: 0 } as chrome.alarms.Alarm)
    }
    await settle()
  }

  const change = async (key: string) => {
    for (const listener of changeListeners) listener({ [key]: {} }, 'local')
    await settle()
  }

  return {
    store,
    alarms,
    sent,
    fire,
    change,
    settle,
    alarmCreate,
    alarmClear,
    sendMessage,
    onAlarmAdd,
    onChangedAdd,
  }
}

function stubFetch(responder: (url: string) => Response) {
  const fetchMock = vi.fn(async (url: string) => responder(url))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function bucketBody(id: number, tasks: Record<string, unknown>[]) {
  return { id, title: `Bucket ${id}`, project_view_id: 4, position: id * 100, limit: 0, tasks }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
})

describe('readVikunjaScheduleFromStorage', () => {
  it('reads credentials, scope and period out of the Todo envelope', async () => {
    installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope({
          config: { ...CONFIG, pullPeriodMin: 15 },
        }),
      },
    })

    await expect(readVikunjaScheduleFromStorage()).resolves.toEqual({
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
      projectId: 1,
      viewId: 4,
      periodMin: 15,
    })
  })

  it('falls back to the default period when none is stored', async () => {
    installChrome({ seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() } })

    const schedule = await readVikunjaScheduleFromStorage()

    expect(schedule?.periodMin).toBe(VIKUNJA_PULL_PERIOD_MIN)
  })

  it('refuses a period outside the offered list rather than scheduling it', async () => {
    installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope({
          // A hand-edited record asking to hammer the instance every 2 seconds.
          config: { ...CONFIG, pullPeriodMin: 0.03 },
        }),
      },
    })

    const schedule = await readVikunjaScheduleFromStorage()

    expect(schedule?.periodMin).toBe(VIKUNJA_PULL_PERIOD_MIN)
  })

  it.each([
    ['no envelope at all', undefined],
    ['a local list with no integration', envelope(null)],
    ['another backend', trelloEnvelope()],
    ['a half-filled scope', vikunjaEnvelope({ config: { ...CONFIG, viewId: null } })],
    ['an unfinished mapping', vikunjaEnvelope({ mapping: null })],
    ['a corrupt record', { nonsense: true }],
  ])('answers null for %s', async (_label, stored) => {
    installChrome({ seed: stored === undefined ? {} : { [VIKUNJA_TODO_STORAGE_KEY]: stored } })

    await expect(readVikunjaScheduleFromStorage()).resolves.toBeNull()
  })
})

describe('ensureAlarm', () => {
  it('creates the alarm with the configured period', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope({ config: { ...CONFIG, pullPeriodMin: 15 } }),
      },
    })

    await ensureAlarm()

    expect(chromeMock.alarmCreate).toHaveBeenCalledWith(VIKUNJA_PULL_ALARM, {
      periodInMinutes: 15,
    })
  })

  it('leaves an alarm that already has the right period alone', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })

    await ensureAlarm()
    chromeMock.alarmCreate.mockClear()
    await ensureAlarm()

    // Re-creating would restart the interval, so a widget whose envelope
    // changes on every ticked-off task would never actually pull.
    expect(chromeMock.alarmCreate).not.toHaveBeenCalled()
  })

  it('re-creates the alarm when the user picks another period', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })

    await ensureAlarm()
    chromeMock.store.set(
      VIKUNJA_TODO_STORAGE_KEY,
      vikunjaEnvelope({ config: { ...CONFIG, pullPeriodMin: 1 } }),
    )
    await ensureAlarm()

    expect(chromeMock.alarms.get(VIKUNJA_PULL_ALARM)?.periodInMinutes).toBe(1)
  })

  it('clears the alarm and every snapshot when there is nothing to pull', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope(),
        [snapshotKey(1, 4)]: { projectId: 1, viewId: 4, tasks: [pulledTask()], pulledAt: 1 },
      },
    })
    await ensureAlarm()

    chromeMock.store.set(VIKUNJA_TODO_STORAGE_KEY, trelloEnvelope())
    await ensureAlarm()

    expect(chromeMock.alarmClear).toHaveBeenCalledWith(VIKUNJA_PULL_ALARM)
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.store.has(snapshotKey(1, 4))).toBe(false)
  })
})

describe('setupVikunjaPull', () => {
  it('registers both listeners synchronously, before any await', () => {
    const chromeMock = installChrome({ seed: {} })

    setupVikunjaPull()

    // The assertion that matters for MV3: the alarm that woke a cold worker
    // is dispatched right after script evaluation, so registration must not
    // sit behind a promise.
    expect(chromeMock.onAlarmAdd).toHaveBeenCalledTimes(1)
    expect(chromeMock.onChangedAdd).toHaveBeenCalledTimes(1)
  })

  it('brings the alarm up to date at worker start', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })

    setupVikunjaPull()
    await vi.waitFor(() => {
      expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)
    })

    expect(chromeMock.alarms.get(VIKUNJA_PULL_ALARM)?.periodInMinutes).toBe(VIKUNJA_PULL_PERIOD_MIN)
  })

  it('reacts to the envelope changing in local storage', async () => {
    const chromeMock = installChrome({ seed: {} })
    setupVikunjaPull()

    chromeMock.store.set(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())
    await chromeMock.change(VIKUNJA_TODO_STORAGE_KEY)

    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)
  })

  it('ignores a change to somebody else’s key', async () => {
    const chromeMock = installChrome({ seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() } })
    setupVikunjaPull()
    await chromeMock.change(VIKUNJA_TODO_STORAGE_KEY)
    chromeMock.alarmCreate.mockClear()

    await chromeMock.change('activity_day')

    expect(chromeMock.alarmCreate).not.toHaveBeenCalled()
  })

  it('clears the alarm and the snapshots when the envelope is removed (disconnect)', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope(),
        [snapshotKey(1, 4)]: { projectId: 1, viewId: 4, tasks: [pulledTask()], pulledAt: 1 },
      },
    })
    setupVikunjaPull()
    await chromeMock.change(VIKUNJA_TODO_STORAGE_KEY)
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)

    // `clearIntegration` wipes the local envelope; the worker sees the removal.
    chromeMock.store.delete(VIKUNJA_TODO_STORAGE_KEY)
    await chromeMock.change(VIKUNJA_TODO_STORAGE_KEY)

    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.store.has(snapshotKey(1, 4))).toBe(false)
  })
})

describe('the alarm firing', () => {
  it('pulls and broadcasts vikunja/pulled when the delta is not empty', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })
    const fetchMock = stubFetch(() => jsonResponse(200, [bucketBody(1, [taskBody()])]))
    setupVikunjaPull()

    await chromeMock.fire()

    expect(fetchMock).toHaveBeenCalled()
    expect(chromeMock.sent).toEqual([
      {
        type: 'vikunja/pulled',
        projectId: 1,
        viewId: 4,
        at: expect.any(Number),
        delta: { added: [4], changed: [], removed: [] },
      },
    ])
  })

  it('stays quiet when nothing moved', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope(),
        // The snapshot already matches what the instance will answer.
        [snapshotKey(1, 4)]: {
          projectId: 1,
          viewId: 4,
          tasks: [pulledTask()],
          // Old enough that the pull is not answered from the cache.
          pulledAt: 1,
        },
      },
    })
    stubFetch(() => jsonResponse(200, [bucketBody(1, [taskBody()])]))
    setupVikunjaPull()

    await chromeMock.fire()

    expect(chromeMock.sent).toEqual([])
  })

  it('ignores an alarm that is not ours', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })
    const fetchMock = stubFetch(() => jsonResponse(200, []))
    setupVikunjaPull()

    await chromeMock.fire('activity-heartbeat')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears the alarm and reports the failure when the host permission is gone', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
      granted: false,
    })
    const fetchMock = stubFetch(() => jsonResponse(200, []))
    setupVikunjaPull()
    await chromeMock.change(VIKUNJA_TODO_STORAGE_KEY)
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)

    await chromeMock.fire()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.sent).toEqual([
      {
        type: 'vikunja/pull-failed',
        projectId: 1,
        viewId: 4,
        at: expect.any(Number),
        errorKey: 'permissionMissing',
      },
    ])
  })

  it('clears the alarm on a dead token — retrying would only keep sending it', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })
    stubFetch(() => jsonResponse(401, { message: 'invalid token' }))
    setupVikunjaPull()
    await chromeMock.change(VIKUNJA_TODO_STORAGE_KEY)

    await chromeMock.fire()

    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.sent).toEqual([
      expect.objectContaining({ type: 'vikunja/pull-failed', errorKey: 'authInvalid' }),
    ])
  })

  it('keeps the alarm on a transient network failure', async () => {
    vi.useFakeTimers()
    try {
      const chromeMock = installChrome({
        seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
      })
      stubFetch(() => jsonResponse(503, {}))
      setupVikunjaPull()
      await vi.advanceTimersByTimeAsync(0)
      expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)

      chromeMock.sendMessage.mockClear()
      chromeMock.alarmClear.mockClear()
      await chromeMock.fire()
      // Let the client exhaust its backoff schedule.
      await vi.advanceTimersByTimeAsync(60_000)

      expect(chromeMock.alarmClear).not.toHaveBeenCalled()
      expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)
      expect(chromeMock.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'vikunja/pull-failed', errorKey: 'network' }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('swallows "Receiving end does not exist" when no page is open', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
      sendMessageImpl: () =>
        Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')),
    })
    stubFetch(() => jsonResponse(200, [bucketBody(1, [taskBody()])]))
    setupVikunjaPull()

    await expect(chromeMock.fire()).resolves.toBeUndefined()

    expect(chromeMock.sendMessage).toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('survives a sendMessage that throws synchronously', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
      sendMessageImpl: () => {
        throw new Error('no receivers')
      },
    })
    stubFetch(() => jsonResponse(200, [bucketBody(1, [taskBody()])]))
    setupVikunjaPull()

    await expect(chromeMock.fire()).resolves.toBeUndefined()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('clears the alarm when the configuration vanished before it fired', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })
    const fetchMock = stubFetch(() => jsonResponse(200, []))
    setupVikunjaPull()
    await chromeMock.change(VIKUNJA_TODO_STORAGE_KEY)

    chromeMock.store.delete(VIKUNJA_TODO_STORAGE_KEY)
    await chromeMock.fire()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.sent).toEqual([])
  })
})

describe('without the chrome APIs', () => {
  it('registers nothing and throws nothing', () => {
    Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })

    expect(() => setupVikunjaPull()).not.toThrow()
  })
})
