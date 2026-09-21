import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ensureAlarm,
  readVikunjaScheduleFrom,
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

/**
 * The **single-board** config, which is still what the bytes on disk look
 * like for anyone who has not reloaded a New Tab page since the update. Most
 * tests below keep using it on purpose: it is the shape the worker has to go
 * on reading. `BOARDS_CONFIG` is the current one.
 */
const CONFIG = {
  baseUrl: 'https://vikunja.example',
  token: 'tk_super-secret-value',
  projectId: 1,
  viewId: 4,
  kanbanMapping: true,
}

/** Host the snapshots of `CONFIG` are keyed under — see `snapshotKey`. */
const SNAPSHOT_HOST = 'vikunja.example'

const MAPPING = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['2'],
  completed: ['3'],
  deleted: ['4'],
}

/**
 * The same connection in the current shape: the boards live in the config,
 * each with the name, buckets, mapping and mode of its own board — which is
 * what the widget's `withBoardState` writes there.
 */
function boardsConfig(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: CONFIG.baseUrl,
    token: CONFIG.token,
    boards: [
      {
        projectId: 1,
        viewId: 4,
        name: 'Probe',
        containers: [],
        mapping: MAPPING,
        kanbanMapping: true,
      },
    ],
    defaultProjectId: 1,
    ...overrides,
  }
}

/** A second and a third board, so a test can show the list is a list. */
function second(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 8,
    viewId: 21,
    name: 'Work',
    containers: [],
    mapping: MAPPING,
    kanbanMapping: true,
    ...overrides,
  }
}

function third(overrides: Record<string, unknown> = {}) {
  return { ...second(), projectId: 12, viewId: 30, name: 'Side', ...overrides }
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
  /** Dispatch a `storage.onChanged` carrying `newValue`, as Chrome does. */
  changeTo: (key: string, newValue: unknown) => Promise<void>
  settle: () => Promise<void>
  alarmCreate: ReturnType<typeof vi.fn>
  alarmClear: ReturnType<typeof vi.fn>
  sendMessage: ReturnType<typeof vi.fn>
  onAlarmAdd: ReturnType<typeof vi.fn>
  onChangedAdd: ReturnType<typeof vi.fn>
  storageGet: ReturnType<typeof vi.fn>
  storageRemove: ReturnType<typeof vi.fn>
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

  const storageGet = vi.fn(async (key: string | null) =>
    key === null ? Object.fromEntries(store) : store.has(key) ? { [key]: store.get(key) } : {},
  )
  const storageSet = vi.fn(async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) store.set(key, value)
  })
  const storageRemove = vi.fn(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key)
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
        local: { get: storageGet, set: storageSet, remove: storageRemove },
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

  const changeTo = async (key: string, newValue: unknown) => {
    // Keep storage and the event in step: the listener parses `newValue`, but
    // a queued reconciliation re-reads storage.
    if (newValue === undefined) store.delete(key)
    else store.set(key, newValue)

    const change = newValue === undefined ? {} : { newValue }
    for (const listener of changeListeners) listener({ [key]: change }, 'local')
    await settle()
  }

  return {
    store,
    alarms,
    sent,
    fire,
    changeTo,
    settle,
    alarmCreate,
    alarmClear,
    sendMessage,
    onAlarmAdd,
    onChangedAdd,
    storageGet,
    storageRemove,
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
      boards: [{ projectId: 1, viewId: 4 }],
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

/**
 * The worker reads whatever the page last *wrote*, and the multi-board
 * upgrade happens when the page *parses*. So both shapes have to answer, or
 * the background pull stops for everyone who has not reloaded a New Tab page
 * yet (and starts again for nobody).
 */
describe('readVikunjaScheduleFrom — the current, multi-board shape', () => {
  it('schedules the one connected board', () => {
    const raw = vikunjaEnvelope({ config: boardsConfig({ pullPeriodMin: 15 }), mapping: null })

    expect(readVikunjaScheduleFrom(raw)).toEqual({
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
      boards: [{ projectId: 1, viewId: 4 }],
      periodMin: 15,
    })
  })

  it('schedules every connected board, in the order they are stored', () => {
    // One alarm, every board: the period is the period of the *connection*,
    // and the tick walks the list. `defaultProjectId` is beside the point
    // here — the default board is a UI notion, and a background pull that
    // read only it would leave the other boards stale.
    const raw = vikunjaEnvelope({
      config: boardsConfig({
        boards: [boardsConfig().boards[0], second(), third()],
        defaultProjectId: 8,
      }),
      mapping: null,
    })

    expect(readVikunjaScheduleFrom(raw)?.boards).toStrictEqual([
      { projectId: 1, viewId: 4 },
      { projectId: 8, viewId: 21 },
      { projectId: 12, viewId: 30 },
    ])
  })

  it('schedules nothing at all while ANY board is unmapped', () => {
    // Deliberately not "the mapped ones": the page refuses to sync in this
    // state (`getSetupStep` keeps the user in the wizard), so reading the
    // other board would spend requests on someone's own server and write a
    // snapshot nothing is going to read. One rule on both sides.
    const raw = vikunjaEnvelope({
      config: boardsConfig({
        boards: [boardsConfig().boards[0], { ...second(), mapping: null }],
      }),
      mapping: null,
    })

    expect(readVikunjaScheduleFrom(raw)).toBeNull()
  })

  it('schedules them all again once the last wizard is finished', () => {
    const raw = vikunjaEnvelope({
      config: boardsConfig({ boards: [boardsConfig().boards[0], second()] }),
      mapping: null,
    })

    expect(readVikunjaScheduleFrom(raw)?.boards).toStrictEqual([
      { projectId: 1, viewId: 4 },
      { projectId: 8, viewId: 21 },
    ])
  })

  it.each([
    ['no board is connected', boardsConfig({ boards: [], defaultProjectId: null })],
    [
      'the only board has no mapping yet',
      boardsConfig({ boards: [{ ...boardsConfig().boards[0], mapping: null }] }),
    ],
    [
      'not one of several boards is mapped',
      boardsConfig({
        boards: [
          { ...boardsConfig().boards[0], mapping: null },
          { ...second(), mapping: null },
        ],
      }),
    ],
  ])('answers null when %s', (_label, config) => {
    // A board with no mapping means the wizard is unfinished, and a pulled
    // task would have nowhere to go. The envelope's slice mirror carries one
    // on purpose: what decides is the board, and the widget writes the
    // mapping to both (`withBoardState`), so the two disagreeing is a record
    // nothing in the UI can produce any more.
    expect(readVikunjaScheduleFrom(vikunjaEnvelope({ config }))).toBeNull()
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
        [snapshotKey(SNAPSHOT_HOST, 1, 4)]: {
          host: SNAPSHOT_HOST,
          projectId: 1,
          viewId: 4,
          tasks: [pulledTask()],
          pulledAt: 1,
          complete: true,
        },
      },
    })
    await ensureAlarm()

    chromeMock.store.set(VIKUNJA_TODO_STORAGE_KEY, trelloEnvelope())
    await ensureAlarm()

    expect(chromeMock.alarmClear).toHaveBeenCalledWith(VIKUNJA_PULL_ALARM)
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.store.has(snapshotKey(SNAPSHOT_HOST, 1, 4))).toBe(false)
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

    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())

    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)
  })

  it('ignores a change to somebody else’s key', async () => {
    const chromeMock = installChrome({ seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() } })
    setupVikunjaPull()
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())
    chromeMock.alarmCreate.mockClear()

    await chromeMock.changeTo('activity_day', { anything: true })

    expect(chromeMock.alarmCreate).not.toHaveBeenCalled()
  })

  it('clears the alarm and the snapshots when the envelope is removed (disconnect)', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope(),
        [snapshotKey(SNAPSHOT_HOST, 1, 4)]: {
          host: SNAPSHOT_HOST,
          projectId: 1,
          viewId: 4,
          tasks: [pulledTask()],
          pulledAt: 1,
          complete: true,
        },
      },
    })
    setupVikunjaPull()
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)

    // `clearIntegration` wipes the local envelope; the worker sees the removal.
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, undefined)

    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.store.has(snapshotKey(SNAPSHOT_HOST, 1, 4))).toBe(false)
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
    // Sent from the read path (`pull.ts`), not from here — the alarm is only
    // one of the callers that can find a moved view.
    expect(chromeMock.sent).toEqual([
      {
        type: 'vikunja/pulled',
        projectId: 1,
        viewId: 4,
        at: expect.any(Number),
        delta: { added: 1, changed: 0, removed: 0 },
      },
    ])
  })

  it('stays quiet when nothing moved', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope(),
        // The snapshot already matches what the instance will answer.
        [snapshotKey(SNAPSHOT_HOST, 1, 4)]: {
          host: SNAPSHOT_HOST,
          projectId: 1,
          viewId: 4,
          tasks: [pulledTask()],
          // Old enough that the pull is not answered from the cache.
          pulledAt: 1,
          complete: true,
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
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())
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
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())

    await chromeMock.fire()

    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.sent).toEqual([
      expect.objectContaining({ type: 'vikunja/pull-failed', errorKey: 'authInvalid' }),
    ])
  })

  it('keeps the alarm on a transient network failure', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })
    stubFetch(() => jsonResponse(503, {}))
    setupVikunjaPull()
    await chromeMock.settle()
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)

    chromeMock.sendMessage.mockClear()
    chromeMock.alarmClear.mockClear()
    // No timer juggling needed: the scheduled read does not retry, so the
    // 5xx comes back on the first attempt.
    await chromeMock.fire()

    expect(chromeMock.alarmClear).not.toHaveBeenCalled()
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)
    expect(chromeMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'vikunja/pull-failed', errorKey: 'network' }),
    )
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
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())

    chromeMock.store.delete(VIKUNJA_TODO_STORAGE_KEY)
    await chromeMock.fire()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.sent).toEqual([])
  })
})

describe('the alarm firing — every connected board', () => {
  /** The path a full view read hits, per board. */
  const VIEW_TASKS = (projectId: number, viewId: number) =>
    `/api/v1/projects/${projectId}/views/${viewId}/tasks`

  function multiBoardEnvelope(boards: Record<string, unknown>[]) {
    return vikunjaEnvelope({
      config: boardsConfig({ boards, defaultProjectId: 1 }),
      mapping: null,
    })
  }

  /** Which views were read, in order, from the fetch trace. */
  function viewsRead(fetchMock: { mock: { calls: [string][] } }): string[] {
    return fetchMock.mock.calls
      .map(([url]) => url)
      .filter((url) => url.includes('/views/'))
      .map((url) => new URL(url).pathname)
  }

  it('pulls every board, one after the other', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([
          boardsConfig().boards[0],
          second(),
          third(),
        ]),
      },
    })
    const fetchMock = stubFetch(() => jsonResponse(200, [bucketBody(1, [taskBody()])]))
    setupVikunjaPull()

    await chromeMock.fire()

    // One alarm, three reads — and the order is the stored order, so a
    // failure is always attributable to a board.
    expect(viewsRead(fetchMock)).toStrictEqual([
      VIEW_TASKS(1, 4),
      VIEW_TASKS(8, 21),
      VIEW_TASKS(12, 30),
    ])
  })

  /** A snapshot that already matches what the stubbed instance will answer. */
  function freshSnapshot(projectId: number, viewId: number) {
    return {
      host: SNAPSHOT_HOST,
      projectId,
      viewId,
      tasks: [pulledTask()],
      // Old enough that the forced read is not answered from the cache.
      pulledAt: 1,
      complete: true,
    }
  }

  it('sends ONE vikunja/pulled for the whole tick, with the totals', async () => {
    // Three boards, two of them moved. A broadcast per board would wake every
    // open page twice — and each wake-up is a sync of *all* the boards, so
    // the second one delivers news the first already covered.
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([
          boardsConfig().boards[0],
          second(),
          third(),
        ]),
        // Board 8 is already up to date; boards 1 and 12 are first reads.
        [snapshotKey(SNAPSHOT_HOST, 8, 21)]: freshSnapshot(8, 21),
      },
    })
    stubFetch(() => jsonResponse(200, [bucketBody(1, [taskBody()])]))
    setupVikunjaPull()

    await chromeMock.fire()

    expect(chromeMock.sent).toEqual([
      {
        type: 'vikunja/pulled',
        // The first board that changed. A page accepts a broadcast about any
        // board it syncs and answers with one sync of all of them.
        projectId: 1,
        viewId: 4,
        at: expect.any(Number),
        // Summed across the tick: one task added on board 1, one on board 12.
        delta: { added: 2, changed: 0, removed: 0 },
      },
    ])
  })

  it('stays completely quiet when no board moved', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([boardsConfig().boards[0], second()]),
        [snapshotKey(SNAPSHOT_HOST, 1, 4)]: freshSnapshot(1, 4),
        [snapshotKey(SNAPSHOT_HOST, 8, 21)]: freshSnapshot(8, 21),
      },
    })
    stubFetch(() => jsonResponse(200, [bucketBody(1, [taskBody()])]))
    setupVikunjaPull()

    await chromeMock.fire()

    expect(chromeMock.sent).toEqual([])
  })

  it('reports the failing board on its own and still announces the rest', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([
          boardsConfig().boards[0],
          second(),
          third(),
        ]),
      },
    })
    stubFetch((url) =>
      url.includes('/views/21/')
        ? jsonResponse(503, {})
        : jsonResponse(200, [bucketBody(1, [taskBody()])]),
    )
    setupVikunjaPull()

    await chromeMock.fire()

    expect(chromeMock.sent).toEqual([
      // Per board, because *which* board is unreachable is the whole message.
      expect.objectContaining({
        type: 'vikunja/pull-failed',
        projectId: 8,
        viewId: 21,
        errorKey: 'network',
      }),
      // And one aggregate for the two that did answer.
      {
        type: 'vikunja/pulled',
        projectId: 1,
        viewId: 4,
        at: expect.any(Number),
        delta: { added: 2, changed: 0, removed: 0 },
      },
    ])
  })

  it('carries on to the next board after a transient failure', async () => {
    // One board behind a restarting proxy must not cost the user every other
    // board's updates for a whole period.
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([boardsConfig().boards[0], second()]),
      },
    })
    const fetchMock = stubFetch((url) =>
      url.includes('/views/4/')
        ? jsonResponse(503, {})
        : jsonResponse(200, [bucketBody(1, [taskBody()])]),
    )
    setupVikunjaPull()

    await chromeMock.fire()

    expect(viewsRead(fetchMock)).toStrictEqual([VIEW_TASKS(1, 4), VIEW_TASKS(8, 21)])
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)
    expect(chromeMock.sent).toEqual([
      expect.objectContaining({
        type: 'vikunja/pull-failed',
        projectId: 1,
        viewId: 4,
        errorKey: 'network',
      }),
      expect.objectContaining({ type: 'vikunja/pulled', projectId: 8, viewId: 21 }),
    ])
  })

  it('stops the whole tick and clears the alarm on a dead token', async () => {
    // `authInvalid` is about the connection, not about the board: the next
    // board would send the very same refused token, so the tick ends here and
    // the alarm goes until the user reconnects.
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([boardsConfig().boards[0], second()]),
      },
    })
    const fetchMock = stubFetch(() => jsonResponse(401, { message: 'invalid token' }))
    setupVikunjaPull()
    await chromeMock.changeTo(
      VIKUNJA_TODO_STORAGE_KEY,
      multiBoardEnvelope([boardsConfig().boards[0], second()]),
    )
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)

    await chromeMock.fire()

    expect(viewsRead(fetchMock)).toStrictEqual([VIEW_TASKS(1, 4)])
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.sent).toEqual([
      expect.objectContaining({
        type: 'vikunja/pull-failed',
        projectId: 1,
        viewId: 4,
        errorKey: 'authInvalid',
      }),
    ])
  })

  it('stops on a withdrawn host permission too, before any request', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([boardsConfig().boards[0], second()]),
      },
      granted: false,
    })
    const fetchMock = stubFetch(() => jsonResponse(200, []))
    setupVikunjaPull()
    await chromeMock.changeTo(
      VIKUNJA_TODO_STORAGE_KEY,
      multiBoardEnvelope([boardsConfig().boards[0], second()]),
    )

    await chromeMock.fire()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.sent).toEqual([
      expect.objectContaining({ type: 'vikunja/pull-failed', errorKey: 'permissionMissing' }),
    ])
  })

  it('schedules nothing while not one board is mapped', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([
          { ...boardsConfig().boards[0], mapping: null },
          second({ mapping: null }),
        ]),
      },
    })
    const fetchMock = stubFetch(() => jsonResponse(200, []))

    setupVikunjaPull()
    await chromeMock.settle()

    expect(chromeMock.alarmCreate).not.toHaveBeenCalled()
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sweeps the snapshots of a board that left the schedule', async () => {
    // A unique board set on purpose: `applySchedule` remembers the last set
    // it swept for, and the memo is worker-scoped — which in a test file is
    // module-scoped and shared with every case above.
    const kept = second({ projectId: 41, viewId: 42 })
    const gone = third({ projectId: 43, viewId: 44 })
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([kept, gone]),
        [snapshotKey(SNAPSHOT_HOST, 41, 42)]: {
          host: SNAPSHOT_HOST,
          projectId: 41,
          viewId: 42,
          tasks: [pulledTask()],
          pulledAt: 1,
          complete: true,
        },
        [snapshotKey(SNAPSHOT_HOST, 43, 44)]: {
          host: SNAPSHOT_HOST,
          projectId: 43,
          viewId: 44,
          tasks: [pulledTask()],
          pulledAt: 1,
          complete: true,
        },
      },
    })
    setupVikunjaPull()
    await chromeMock.settle()
    expect(chromeMock.store.has(snapshotKey(SNAPSHOT_HOST, 43, 44))).toBe(true)

    // The user removes the second board. Nothing else would ever invalidate
    // its snapshot: the pull only writes the keys it reads.
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, multiBoardEnvelope([kept]))

    expect(chromeMock.store.has(snapshotKey(SNAPSHOT_HOST, 41, 42))).toBe(true)
    expect(chromeMock.store.has(snapshotKey(SNAPSHOT_HOST, 43, 44))).toBe(false)
    // The envelope itself is not a snapshot.
    expect(chromeMock.store.has(VIKUNJA_TODO_STORAGE_KEY)).toBe(true)
  })

  it('sweeps a snapshot left behind when a board is re-pointed at another view', async () => {
    const before = second({ projectId: 51, viewId: 52 })
    const after = second({ projectId: 51, viewId: 53 })
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([before]),
        [snapshotKey(SNAPSHOT_HOST, 51, 52)]: {
          host: SNAPSHOT_HOST,
          projectId: 51,
          viewId: 52,
          tasks: [pulledTask()],
          pulledAt: 1,
          complete: true,
        },
      },
    })
    setupVikunjaPull()
    await chromeMock.settle()

    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, multiBoardEnvelope([after]))

    // The key carries the view, so changing it orphans the old record.
    expect(chromeMock.store.has(snapshotKey(SNAPSHOT_HOST, 51, 52))).toBe(false)
  })

  it('keeps one alarm for the whole connection, whatever the board count', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: multiBoardEnvelope([
          boardsConfig().boards[0],
          second(),
          third(),
        ]),
      },
    })

    await ensureAlarm()

    // The period is the connection's, not a board's — three boards must not
    // become three alarms (nor divide the period between them).
    expect(chromeMock.alarmCreate).toHaveBeenCalledTimes(1)
    expect(chromeMock.alarmCreate).toHaveBeenCalledWith(VIKUNJA_PULL_ALARM, {
      periodInMinutes: VIKUNJA_PULL_PERIOD_MIN,
    })
  })
})

describe('without the chrome APIs', () => {
  it('registers nothing and throws nothing', () => {
    Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })

    expect(() => setupVikunjaPull()).not.toThrow()
  })
})

describe('readVikunjaScheduleFrom', () => {
  it('parses the envelope the change event already handed us', () => {
    // No `chrome` installed at all: the point of this entry point is that it
    // needs no storage read.
    expect(readVikunjaScheduleFrom(vikunjaEnvelope())).toEqual({
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
      // The single-board shape yields exactly one board, so the tick below
      // takes the same path for both records on disk.
      boards: [{ projectId: 1, viewId: 4 }],
      periodMin: VIKUNJA_PULL_PERIOD_MIN,
    })
  })

  it.each([
    ['a removal', undefined],
    ['an explicit null', null],
    ['another backend', trelloEnvelope()],
  ])('answers null for %s', (_label, raw) => {
    expect(readVikunjaScheduleFrom(raw)).toBeNull()
  })

  it('agrees with the storage-reading variant', async () => {
    installChrome({ seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() } })

    await expect(readVikunjaScheduleFromStorage()).resolves.toEqual(
      readVikunjaScheduleFrom(vikunjaEnvelope()),
    )
  })
})

describe('reacting to storage without re-reading it', () => {
  it('schedules from the change event alone, and costs nothing per edit', async () => {
    const chromeMock = installChrome({ seed: {} })
    setupVikunjaPull()
    await chromeMock.settle()

    // Chrome hands the whole envelope to the listener; going back to storage
    // for it would be a read per task the user ticks off.
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())
    expect(chromeMock.alarms.get(VIKUNJA_PULL_ALARM)?.periodInMinutes).toBe(VIKUNJA_PULL_PERIOD_MIN)

    // The first sight of a board set sweeps the orphaned snapshots, which
    // costs one key listing. Every edit after it must be free — that is what
    // the memo in `applySchedule` is for, and a widget whose envelope changes
    // on every ticked-off task is the case it protects.
    chromeMock.storageGet.mockClear()
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, vikunjaEnvelope())

    expect(chromeMock.storageGet).not.toHaveBeenCalled()
  })

  it('does not sweep storage for snapshots when there was no alarm', async () => {
    const chromeMock = installChrome({ seed: {} })
    setupVikunjaPull()
    await chromeMock.settle()
    chromeMock.storageGet.mockClear()
    chromeMock.storageRemove.mockClear()

    // A Trello user (or a plain local list) editing a task: nothing of ours
    // is stored, so nothing of ours needs cleaning.
    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, trelloEnvelope())

    expect(chromeMock.storageGet).not.toHaveBeenCalled()
    expect(chromeMock.storageRemove).not.toHaveBeenCalled()
  })

  it('still sweeps them on the transition out of being scheduled', async () => {
    const chromeMock = installChrome({
      seed: {
        [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope(),
        [snapshotKey(SNAPSHOT_HOST, 1, 4)]: {
          host: SNAPSHOT_HOST,
          projectId: 1,
          viewId: 4,
          tasks: [pulledTask()],
          pulledAt: 1,
          complete: true,
        },
      },
    })
    setupVikunjaPull()
    await chromeMock.settle()
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)

    await chromeMock.changeTo(VIKUNJA_TODO_STORAGE_KEY, undefined)

    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(false)
    expect(chromeMock.store.has(snapshotKey(SNAPSHOT_HOST, 1, 4))).toBe(false)
  })
})

describe('one reconciliation at a time', () => {
  it('two concurrent ensureAlarm calls create the alarm once', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })

    await Promise.all([ensureAlarm(), ensureAlarm()])

    // Without the guard both runs would read "no alarm" before either
    // created one, and the second create would restart the interval.
    expect(chromeMock.alarmCreate).toHaveBeenCalledTimes(1)
  })

  it('does not lose a change that arrived mid-run', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })

    const first = ensureAlarm()
    // The user picks another period while the first run is in flight; the
    // queued tail re-reads storage, which is authoritative.
    chromeMock.store.set(
      VIKUNJA_TODO_STORAGE_KEY,
      vikunjaEnvelope({ config: { ...CONFIG, pullPeriodMin: 1 } }),
    )
    await Promise.all([first, ensureAlarm()])

    expect(chromeMock.alarms.get(VIKUNJA_PULL_ALARM)?.periodInMinutes).toBe(1)
  })

  it('survives an alarms.create that rejects', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })
    chromeMock.alarmCreate.mockReturnValue(Promise.reject(new Error('no room')))

    await expect(ensureAlarm()).resolves.toBeUndefined()
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('the scheduled read does not retry', () => {
  it('issues exactly one request on a 5xx and reports network', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })
    const fetchMock = stubFetch(() => jsonResponse(503, {}))
    setupVikunjaPull()
    await chromeMock.settle()

    await chromeMock.fire()

    // The next tick is the retry; a 12-second backoff would be spent in a
    // worker Chrome is entitled to unload.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(chromeMock.alarms.has(VIKUNJA_PULL_ALARM)).toBe(true)
    expect(chromeMock.sent).toEqual([
      expect.objectContaining({ type: 'vikunja/pull-failed', errorKey: 'network' }),
    ])
  })
})

describe('what the worker is allowed to log', () => {
  it('never writes the token or the instance host to the console', async () => {
    const chromeMock = installChrome({
      seed: { [VIKUNJA_TODO_STORAGE_KEY]: vikunjaEnvelope() },
    })
    stubFetch(() => jsonResponse(503, {}))
    setupVikunjaPull()
    await chromeMock.settle()
    await chromeMock.fire()

    const warn = vi.mocked(console.warn)
    const error = vi.mocked(console.error)
    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls])
    expect(logged).not.toContain(CONFIG.token)
    expect(logged).not.toContain('vikunja.example')
  })
})
