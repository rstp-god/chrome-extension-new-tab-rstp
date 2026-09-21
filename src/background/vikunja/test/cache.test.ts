import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSnapshots,
  readSnapshot,
  snapshotKey,
  VIKUNJA_SNAPSHOT_PREFIX,
  writeSnapshot,
} from '@/background/vikunja/cache.ts'
import {
  VIKUNJA_SNAPSHOT_MAX_BYTES,
  VIKUNJA_SNAPSHOT_MAX_TASKS,
} from '@/background/vikunja/constants.ts'

import type { VikunjaSnapshot } from '@/background/vikunja/cache.ts'
import type { VikunjaPulledTask } from '@/background/vikunja/messages.ts'

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

function snapshot(overrides: Partial<VikunjaSnapshot> = {}): VikunjaSnapshot {
  return { projectId: 1, viewId: 4, tasks: [task()], pulledAt: 1_700_000_000_000, ...overrides }
}

/**
 * A `chrome.storage` whose `local` really stores and whose `sync` only
 * records that it was touched: a snapshot is someone's task list written on
 * every background pull, and `sync` is both quota-tiny and mirrored off the
 * device.
 */
function installStorage(seed: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(seed))
  const sync = {
    get: vi.fn(async () => ({})),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  }
  const local = {
    get: vi.fn(async (key: string | null) => {
      if (key === null) return Object.fromEntries(store)
      return store.has(key) ? { [key]: store.get(key) } : {}
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) store.set(key, value)
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key)
    }),
  }

  Object.defineProperty(globalThis, 'chrome', {
    value: { storage: { local, sync } },
    configurable: true,
  })

  return { store, local, sync }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
})

describe('snapshotKey', () => {
  it('is scoped to the view, under the shared prefix', () => {
    expect(snapshotKey(1, 4)).toBe(`${VIKUNJA_SNAPSHOT_PREFIX}1:4`)
    expect(snapshotKey(1, 5)).not.toBe(snapshotKey(1, 4))
    expect(snapshotKey(2, 4)).not.toBe(snapshotKey(1, 4))
  })
})

describe('write then read', () => {
  it('round-trips a snapshot through storage.local', async () => {
    const { local, sync } = installStorage()

    await expect(writeSnapshot(snapshot())).resolves.toBe(true)
    await expect(readSnapshot(1, 4)).resolves.toEqual(snapshot())

    expect(local.set).toHaveBeenCalledWith({ [snapshotKey(1, 4)]: snapshot() })
    expect(sync.set).not.toHaveBeenCalled()
    expect(sync.get).not.toHaveBeenCalled()
  })

  it('answers null for a view that was never pulled', async () => {
    installStorage()

    await writeSnapshot(snapshot())

    await expect(readSnapshot(1, 9)).resolves.toBeNull()
  })

  it('truncates the task list to the documented ceiling', async () => {
    const { store } = installStorage()
    const tasks = Array.from({ length: VIKUNJA_SNAPSHOT_MAX_TASKS + 10 }, (_, index) =>
      task({ id: index + 1 }),
    )

    await writeSnapshot(snapshot({ tasks }))

    const stored = store.get(snapshotKey(1, 4)) as VikunjaSnapshot
    expect(stored.tasks).toHaveLength(VIKUNJA_SNAPSHOT_MAX_TASKS)
    // And the bound survives the round trip rather than being re-read as-is.
    const read = await readSnapshot(1, 4)
    expect(read?.tasks).toHaveLength(VIKUNJA_SNAPSHOT_MAX_TASKS)
  })
})

describe('reading a record we did not write', () => {
  it.each([
    ['a non-object', 'nonsense'],
    ['a missing field', { projectId: 1, viewId: 4, pulledAt: 1 }],
    ['a task with no id', { projectId: 1, viewId: 4, pulledAt: 1, tasks: [{ title: 'x' }] }],
    ['a body addressing another view', { projectId: 1, viewId: 9, tasks: [], pulledAt: 1 }],
    [
      'a task list past the ceiling',
      {
        projectId: 1,
        viewId: 4,
        pulledAt: 1,
        tasks: Array.from({ length: VIKUNJA_SNAPSHOT_MAX_TASKS + 1 }, (_, i) =>
          task({ id: i + 1 }),
        ),
      },
    ],
  ])('treats %s as absent', async (_label, stored) => {
    installStorage({ [snapshotKey(1, 4)]: stored })

    await expect(readSnapshot(1, 4)).resolves.toBeNull()
  })

  it('treats a storage read that throws as absent', async () => {
    const { local } = installStorage()
    local.get.mockRejectedValueOnce(new Error('storage gone'))

    await expect(readSnapshot(1, 4)).resolves.toBeNull()
  })
})

describe('clearSnapshots', () => {
  it('removes every snapshot and nothing else', async () => {
    const { store, sync } = installStorage({
      [snapshotKey(1, 4)]: snapshot(),
      [snapshotKey(7, 8)]: snapshot({ projectId: 7, viewId: 8 }),
      'todo-widget:v1': { keep: true },
      activity_day: { keep: true },
    })

    await clearSnapshots()

    expect([...store.keys()].sort()).toEqual(['activity_day', 'todo-widget:v1'])
    expect(sync.remove).not.toHaveBeenCalled()
  })

  it('does not call remove when there is nothing to clear', async () => {
    const { local } = installStorage({ 'todo-widget:v1': {} })

    await clearSnapshots()

    expect(local.remove).not.toHaveBeenCalled()
  })

  it('swallows a storage failure', async () => {
    const { local } = installStorage({ [snapshotKey(1, 4)]: snapshot() })
    local.remove.mockRejectedValueOnce(new Error('quota'))

    await expect(clearSnapshots()).resolves.toBeUndefined()
  })
})

describe('without a chrome.storage API', () => {
  it('degrades to an empty cache instead of throwing', async () => {
    Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })

    await expect(readSnapshot(1, 4)).resolves.toBeNull()
    await expect(writeSnapshot(snapshot())).resolves.toBe(false)
    await expect(clearSnapshots()).resolves.toBeUndefined()
  })
})

describe('the byte budget', () => {
  /** A task whose description alone is ~50 KB of rich text. */
  function heavyTask(id: number): VikunjaPulledTask {
    return task({ id, description: 'x'.repeat(50_000) })
  }

  it('drops trailing tasks until the record fits', async () => {
    const { store } = installStorage()
    // 60 × 50 KB ≈ 3 MB: under the count cap, twice over the byte budget.
    const tasks = Array.from({ length: 60 }, (_, index) => heavyTask(index + 1))

    await writeSnapshot(snapshot({ tasks }))

    const stored = store.get(snapshotKey(1, 4)) as VikunjaSnapshot
    expect(JSON.stringify(stored).length).toBeLessThanOrEqual(VIKUNJA_SNAPSHOT_MAX_BYTES)
    // Trailing tasks go, so the board's own order decides what survives.
    expect(stored.tasks.length).toBeGreaterThan(0)
    expect(stored.tasks.length).toBeLessThan(tasks.length)
    expect(stored.tasks[0].id).toBe(1)
  })

  it('leaves an ordinary snapshot untouched', async () => {
    const { store } = installStorage()
    const tasks = Array.from({ length: 50 }, (_, index) => task({ id: index + 1 }))

    await writeSnapshot(snapshot({ tasks }))

    expect((store.get(snapshotKey(1, 4)) as VikunjaSnapshot).tasks).toHaveLength(50)
  })

  it('applies the count cap before the byte budget', async () => {
    const { store } = installStorage()
    const tasks = Array.from({ length: VIKUNJA_SNAPSHOT_MAX_TASKS + 5 }, (_, index) =>
      task({ id: index + 1 }),
    )

    await writeSnapshot(snapshot({ tasks }))

    const stored = store.get(snapshotKey(1, 4)) as VikunjaSnapshot
    expect(stored.tasks).toHaveLength(VIKUNJA_SNAPSHOT_MAX_TASKS)
    expect(JSON.stringify(stored).length).toBeLessThanOrEqual(VIKUNJA_SNAPSHOT_MAX_BYTES)
  })

  it('writes a task list of one even when that one is oversized on its own', async () => {
    const { store } = installStorage()

    // Nothing can be done about a single record over the budget — the point
    // of the cap is that N of them cannot multiply, not that one is refused.
    await writeSnapshot(snapshot({ tasks: [task({ description: 'x'.repeat(50_000) })] }))

    expect((store.get(snapshotKey(1, 4)) as VikunjaSnapshot).tasks).toHaveLength(1)
  })
})

describe('clearSnapshots key listing', () => {
  it('prefers getKeys() and never reads a single value', async () => {
    const { store, local } = installStorage({
      [snapshotKey(1, 4)]: snapshot(),
      'todo-widget:v1': { keep: true },
    })
    const getKeys = vi.fn(async () => [...store.keys()])
    Object.assign(local, { getKeys })

    await clearSnapshots()

    expect(getKeys).toHaveBeenCalledTimes(1)
    // `get(null)` would pull every stored value into memory just to read its
    // keys — including somebody's whole task list.
    expect(local.get).not.toHaveBeenCalled()
    expect([...store.keys()]).toEqual(['todo-widget:v1'])
  })

  it('falls back to get(null) where getKeys is not available', async () => {
    const { store, local } = installStorage({ [snapshotKey(1, 4)]: snapshot() })

    await clearSnapshots()

    expect(local.get).toHaveBeenCalledWith(null)
    expect(store.size).toBe(0)
  })
})
