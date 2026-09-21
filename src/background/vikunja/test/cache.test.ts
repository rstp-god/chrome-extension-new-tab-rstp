import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSnapshots,
  pruneSnapshots,
  readSnapshot,
  snapshotBudgetBytes,
  snapshotKey,
  VIKUNJA_SNAPSHOT_PREFIX,
  writeSnapshot,
} from '@/background/vikunja/cache.ts'
import {
  VIKUNJA_SNAPSHOT_MAX_BYTES,
  VIKUNJA_SNAPSHOT_MAX_TASKS,
  VIKUNJA_SNAPSHOT_TOTAL_MAX_BYTES,
} from '@/background/vikunja/constants.ts'

import type { VikunjaSnapshot } from '@/background/vikunja/cache.ts'
import type { VikunjaPulledTask } from '@/background/vikunja/messages.ts'

/** The instance every fixture below belongs to — see `snapshotKey`. */
const HOST = 'vikunja.example'

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
    ...overrides,
  }
}

function snapshot(overrides: Partial<VikunjaSnapshot> = {}): VikunjaSnapshot {
  return {
    host: HOST,
    projectId: 1,
    viewId: 4,
    tasks: [task()],
    pulledAt: 1_700_000_000_000,
    complete: true,
    ...overrides,
  }
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
    expect(snapshotKey(HOST, 1, 4)).toBe(`${VIKUNJA_SNAPSHOT_PREFIX}${HOST}:1:4`)
    expect(snapshotKey(HOST, 1, 5)).not.toBe(snapshotKey(HOST, 1, 4))
    expect(snapshotKey(HOST, 2, 4)).not.toBe(snapshotKey(HOST, 1, 4))
    // Ids are per instance: the same pair on another server is another view.
    expect(snapshotKey('other.example', 1, 4)).not.toBe(snapshotKey(HOST, 1, 4))
  })
})

describe('write then read', () => {
  it('round-trips a snapshot through storage.local', async () => {
    const { local, sync } = installStorage()

    await expect(writeSnapshot(snapshot())).resolves.toBe(true)
    await expect(readSnapshot(HOST, 1, 4)).resolves.toEqual(snapshot())

    expect(local.set).toHaveBeenCalledWith({ [snapshotKey(HOST, 1, 4)]: snapshot() })
    expect(sync.set).not.toHaveBeenCalled()
    expect(sync.get).not.toHaveBeenCalled()
  })

  it('answers null for a view that was never pulled', async () => {
    installStorage()

    await writeSnapshot(snapshot())

    await expect(readSnapshot(HOST, 1, 9)).resolves.toBeNull()
  })

  it('refuses a task list past the documented ceiling, whole', async () => {
    const { store } = installStorage({ [snapshotKey(HOST, 1, 4)]: snapshot() })
    const tasks = Array.from({ length: VIKUNJA_SNAPSHOT_MAX_TASKS + 10 }, (_, index) =>
      task({ id: index + 1 }),
    )

    await expect(writeSnapshot(snapshot({ tasks }))).resolves.toBe(false)

    // Not trimmed to fit: a trimmed record would be served as the whole view.
    // And the record the previous read left is gone with it — it no longer
    // describes the view, and a fresh one would answer the next pull.
    expect(store.has(snapshotKey(HOST, 1, 4))).toBe(false)
    await expect(readSnapshot(HOST, 1, 4)).resolves.toBeNull()
  })

  it('writes exactly the ceiling', async () => {
    const { store } = installStorage()
    const tasks = Array.from({ length: VIKUNJA_SNAPSHOT_MAX_TASKS }, (_, index) =>
      task({ id: index + 1 }),
    )

    await expect(writeSnapshot(snapshot({ tasks }))).resolves.toBe(true)

    expect((store.get(snapshotKey(HOST, 1, 4)) as VikunjaSnapshot).tasks).toHaveLength(
      VIKUNJA_SNAPSHOT_MAX_TASKS,
    )
  })
})

describe('reading a record we did not write', () => {
  it.each([
    ['a non-object', 'nonsense'],
    ['a missing field', { host: HOST, projectId: 1, viewId: 4, pulledAt: 1 }],
    [
      'a task with no id',
      { host: HOST, projectId: 1, viewId: 4, pulledAt: 1, tasks: [{ title: 'x' }] },
    ],
    [
      'a body addressing another view',
      { host: HOST, projectId: 1, viewId: 9, tasks: [], pulledAt: 1 },
    ],
    [
      'a body addressing another instance',
      { host: 'other.example', projectId: 1, viewId: 4, tasks: [], pulledAt: 1, complete: true },
    ],
    [
      // The build that wrote it trimmed what did not fit and said nothing
      // about it; served as the whole view, such a record would have a page
      // drop every task past the cut.
      'a record without the completeness marker',
      { host: HOST, projectId: 1, viewId: 4, tasks: [task()], pulledAt: 1 },
    ],
    [
      'a record whose marker is not true',
      { host: HOST, projectId: 1, viewId: 4, tasks: [task()], pulledAt: 1, complete: false },
    ],
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
    installStorage({ [snapshotKey(HOST, 1, 4)]: stored })

    await expect(readSnapshot(HOST, 1, 4)).resolves.toBeNull()
  })

  it('strips a task field it does not know rather than refusing the record', async () => {
    // `labelIds` left the wire when the widget stopped surfacing labels as
    // projects. A field a later build stops writing costs nothing on read;
    // only the completeness marker is a hard requirement.
    const stale = {
      ...snapshot(),
      tasks: [{ ...task(), labelIds: [1, 7] }],
    }
    installStorage({ [snapshotKey(HOST, 1, 4)]: stale })

    const out = await readSnapshot(HOST, 1, 4)

    expect(out).toEqual(snapshot())
    expect(out?.tasks[0]).not.toHaveProperty('labelIds')
  })

  it('treats a storage read that throws as absent', async () => {
    const { local } = installStorage()
    local.get.mockRejectedValueOnce(new Error('storage gone'))

    await expect(readSnapshot(HOST, 1, 4)).resolves.toBeNull()
  })
})

describe('snapshotBudgetBytes', () => {
  it.each([
    ['one board gets the whole per-board cap', 1, VIKUNJA_SNAPSHOT_MAX_BYTES],
    ['two boards still fit under it', 2, VIKUNJA_SNAPSHOT_MAX_BYTES],
    ['four boards divide the connection total', 4, VIKUNJA_SNAPSHOT_TOTAL_MAX_BYTES / 4],
    ['ten boards divide it further', 10, VIKUNJA_SNAPSHOT_TOTAL_MAX_BYTES / 10],
  ])('%s', (_label, boards, expected) => {
    expect(snapshotBudgetBytes(boards)).toBe(expected)
  })

  it.each([
    ['an absent count', undefined],
    ['zero boards', 0],
    ['a negative count', -3],
    ['a fractional count', 2.5],
  ])('falls back to one board for %s', (_label, boards) => {
    // A caller reading one view on its own says nothing about the connection;
    // the per-board cap is the honest answer, and a division by zero or by a
    // fraction is not an answer at all.
    expect(snapshotBudgetBytes(boards)).toBe(VIKUNJA_SNAPSHOT_MAX_BYTES)
  })

  it('never exceeds the per-board cap, whatever the board count', () => {
    for (const boards of [1, 2, 3, 5, 20]) {
      expect(snapshotBudgetBytes(boards)).toBeLessThanOrEqual(VIKUNJA_SNAPSHOT_MAX_BYTES)
    }
  })
})

describe('writeSnapshot with a divided budget', () => {
  /** A task whose description alone is ~50 KB of rich text. */
  function heavy(id: number): VikunjaPulledTask {
    return task({ id, description: 'x'.repeat(50_000) })
  }

  it('judges by the budget it was given, not by the per-board cap', async () => {
    const { store } = installStorage()
    // 20 × 50 KB ≈ 1 MB: under the per-board cap, over an eighth of the total.
    const tasks = Array.from({ length: 20 }, (_, index) => heavy(index + 1))

    await expect(writeSnapshot(snapshot({ tasks }), VIKUNJA_SNAPSHOT_MAX_BYTES)).resolves.toBe(true)
    expect((store.get(snapshotKey(HOST, 1, 4)) as VikunjaSnapshot).tasks).toHaveLength(20)

    await expect(writeSnapshot(snapshot({ tasks }), snapshotBudgetBytes(8))).resolves.toBe(false)
    // Refused whole, and the record the generous write left is gone with it.
    expect(store.has(snapshotKey(HOST, 1, 4))).toBe(false)
  })

  it('defaults to the per-board cap when no budget is passed', async () => {
    const { store } = installStorage()
    const tasks = Array.from({ length: 20 }, (_, index) => heavy(index + 1))

    await expect(writeSnapshot(snapshot({ tasks }))).resolves.toBe(true)

    const stored = store.get(snapshotKey(HOST, 1, 4)) as VikunjaSnapshot
    expect(JSON.stringify(stored).length).toBeLessThanOrEqual(VIKUNJA_SNAPSHOT_MAX_BYTES)
    expect(JSON.stringify(stored).length).toBeGreaterThan(snapshotBudgetBytes(8))
  })
})

describe('pruneSnapshots', () => {
  it('removes the snapshots of boards the schedule no longer names', async () => {
    const { store } = installStorage({
      [snapshotKey(HOST, 1, 4)]: snapshot(),
      // A board the user removed.
      [snapshotKey(HOST, 7, 8)]: snapshot({ projectId: 7, viewId: 8 }),
      // The same board re-pointed at another view: the key carries the view,
      // so the old one is orphaned the moment `withScope` changes it.
      [snapshotKey(HOST, 1, 99)]: snapshot({ projectId: 1, viewId: 99 }),
    })

    await pruneSnapshots(HOST, [{ projectId: 1, viewId: 4 }])

    expect([...store.keys()]).toStrictEqual([snapshotKey(HOST, 1, 4)])
  })

  it('leaves another instance’s snapshots alone', async () => {
    // Not this connection's to judge — the user may be moving between two
    // servers, and `clearSnapshots` is what sweeps those on disconnect.
    const other = snapshotKey('other.example', 1, 4)
    const { store } = installStorage({
      [snapshotKey(HOST, 7, 8)]: snapshot({ projectId: 7, viewId: 8 }),
      [other]: snapshot(),
    })

    await pruneSnapshots(HOST, [])

    expect([...store.keys()]).toStrictEqual([other])
  })

  it('leaves everything that is not a snapshot alone', async () => {
    const { store } = installStorage({
      'todo-widget:v1': { anything: true },
      [snapshotKey(HOST, 7, 8)]: snapshot({ projectId: 7, viewId: 8 }),
    })

    await pruneSnapshots(HOST, [{ projectId: 1, viewId: 4 }])

    expect([...store.keys()]).toStrictEqual(['todo-widget:v1'])
  })

  it('writes nothing when every board is still scheduled', async () => {
    const { local } = installStorage({ [snapshotKey(HOST, 1, 4)]: snapshot() })

    await pruneSnapshots(HOST, [{ projectId: 1, viewId: 4 }])

    expect(local.remove).not.toHaveBeenCalled()
  })

  it('survives a storage listing that throws', async () => {
    const { local } = installStorage({ [snapshotKey(HOST, 7, 8)]: snapshot() })
    local.get.mockRejectedValueOnce(new Error('storage gone'))

    await expect(pruneSnapshots(HOST, [])).resolves.toBeUndefined()
  })
})

describe('clearSnapshots', () => {
  it('removes every snapshot and nothing else', async () => {
    const { store, sync } = installStorage({
      [snapshotKey(HOST, 1, 4)]: snapshot(),
      [snapshotKey(HOST, 7, 8)]: snapshot({ projectId: 7, viewId: 8 }),
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
    const { local } = installStorage({ [snapshotKey(HOST, 1, 4)]: snapshot() })
    local.remove.mockRejectedValueOnce(new Error('quota'))

    await expect(clearSnapshots()).resolves.toBeUndefined()
  })
})

describe('without a chrome.storage API', () => {
  it('degrades to an empty cache instead of throwing', async () => {
    Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })

    await expect(readSnapshot(HOST, 1, 4)).resolves.toBeNull()
    await expect(writeSnapshot(snapshot())).resolves.toBe(false)
    await expect(clearSnapshots()).resolves.toBeUndefined()
  })
})

describe('the byte budget', () => {
  /** A task whose description alone is ~50 KB of rich text. */
  function heavyTask(id: number): VikunjaPulledTask {
    return task({ id, description: 'x'.repeat(50_000) })
  }

  it('refuses a record over the byte budget, whole', async () => {
    const { store, local } = installStorage()
    // 60 × 50 KB ≈ 3 MB: under the count cap, twice over the byte budget.
    const tasks = Array.from({ length: 60 }, (_, index) => heavyTask(index + 1))

    await expect(writeSnapshot(snapshot({ tasks }))).resolves.toBe(false)

    // Not a shorter record — none. A trimmed one would be served as the whole
    // view, and a page trusting it would drop every task past the cut.
    expect(store.has(snapshotKey(HOST, 1, 4))).toBe(false)
    expect(local.set).not.toHaveBeenCalled()
  })

  it('leaves an ordinary snapshot untouched', async () => {
    const { store } = installStorage()
    const tasks = Array.from({ length: 50 }, (_, index) => task({ id: index + 1 }))

    await expect(writeSnapshot(snapshot({ tasks }))).resolves.toBe(true)

    expect((store.get(snapshotKey(HOST, 1, 4)) as VikunjaSnapshot).tasks).toHaveLength(50)
  })

  it('removes the record the previous read left, and says so with ids only', async () => {
    const { store } = installStorage({ [snapshotKey(HOST, 1, 4)]: snapshot() })
    const tasks = Array.from({ length: 60 }, (_, index) => heavyTask(index + 1))

    await writeSnapshot(snapshot({ tasks }))

    expect(store.has(snapshotKey(HOST, 1, 4))).toBe(false)
    expect(console.warn).toHaveBeenCalledWith('[vikunja] snapshot over budget, not cached', {
      projectId: 1,
      viewId: 4,
      tasks: 60,
      maxBytes: VIKUNJA_SNAPSHOT_MAX_BYTES,
    })
    // Never the host, a title or a description.
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls)
    expect(logged).not.toContain(HOST)
    expect(logged).not.toContain('xxxxx')
  })

  it('still answers false when the stale record cannot be removed', async () => {
    const { local } = installStorage({ [snapshotKey(HOST, 1, 4)]: snapshot() })
    local.remove.mockRejectedValueOnce(new Error('storage gone'))
    const tasks = Array.from({ length: 60 }, (_, index) => heavyTask(index + 1))

    await expect(writeSnapshot(snapshot({ tasks }))).resolves.toBe(false)
  })
})

describe('clearSnapshots key listing', () => {
  it('prefers getKeys() and never reads a single value', async () => {
    const { store, local } = installStorage({
      [snapshotKey(HOST, 1, 4)]: snapshot(),
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
    const { store, local } = installStorage({ [snapshotKey(HOST, 1, 4)]: snapshot() })

    await clearSnapshots()

    expect(local.get).toHaveBeenCalledWith(null)
    expect(store.size).toBe(0)
  })
})
