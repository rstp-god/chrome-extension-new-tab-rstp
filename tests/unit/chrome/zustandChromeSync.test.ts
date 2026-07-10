import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand'
import { withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import { z } from 'zod'

const getAreaMock = vi.hoisted(() =>
  vi.fn<(area: string, key: string) => Promise<unknown>>(async () => null),
)
const setAreaMock = vi.hoisted(() =>
  vi.fn<(area: string, key: string, value: unknown) => Promise<boolean>>(async () => true),
)
const removeAreaMock = vi.hoisted(() =>
  vi.fn<(area: string, key: string) => Promise<void>>(async () => {}),
)

vi.mock('@/services/chrome/runtime.ts', () => ({
  isShowcaseMode: () => true,
  hasChromeStorageEvents: () => false,
  getChromeObject: () => null,
}))

vi.mock('@/services/chrome/storage.ts', () => ({
  getArea: getAreaMock,
  setArea: setAreaMock,
  removeArea: removeAreaMock,
}))

const schema = z.object({
  meta: z.object({ originId: z.string(), rev: z.number(), ts: z.number() }),
  state: z.object({ count: z.number() }),
})

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('withChromeSync', () => {
  beforeEach(() => {
    getAreaMock.mockReset()
    getAreaMock.mockResolvedValue(null)
    setAreaMock.mockReset()
    setAreaMock.mockResolvedValue(true)
    removeAreaMock.mockReset()
  })

  it('exposes commit action and writes current state', async () => {
    const store = createStore(
      withChromeSync({
        key: 'k',
        schema,
        partialize: (s: { count: number }) => ({ count: s.count }),
        merge: (_c, p) => p,
        autoPersist: false,
      })(() => ({ count: 1 })),
    )

    await store.getState().commit()

    expect(typeof store.getState().commit).toBe('function')
    expect(setAreaMock).toHaveBeenCalledOnce()
    expect(setAreaMock).toHaveBeenCalledWith('local', 'k', expect.anything())
  })

  it('skips a write when the persisted slice is unchanged', async () => {
    const store = createStore(
      withChromeSync({
        key: 'k',
        schema,
        partialize: (s: { count: number }) => ({ count: s.count }),
        merge: (_c, p) => p,
        autoPersist: false,
      })(() => ({ count: 1 })),
    )

    await store.getState().commit()
    await store.getState().commit() // identical slice → no second write

    expect(setAreaMock).toHaveBeenCalledOnce()
  })

  it('hydrates state from storage envelope on init', async () => {
    getAreaMock.mockResolvedValueOnce({
      meta: { originId: 'remote', rev: 3, ts: 10 },
      state: { count: 7 },
    })

    const store = createStore(
      withChromeSync({
        key: 'k',
        schema,
        partialize: (s: { count: number }) => ({ count: s.count }),
        merge: (_c, p) => p,
        autoPersist: false,
      })(() => ({ count: 1 })),
    )

    await flush()

    expect(store.getState().count).toBe(7)
  })

  it('writes to the configured area (sync)', async () => {
    const store = createStore(
      withChromeSync({
        key: 'k',
        area: 'sync',
        schema,
        partialize: (s: { count: number }) => ({ count: s.count }),
        merge: (_c, p) => p,
        autoPersist: false,
      })(() => ({ count: 2 })),
    )

    await flush()
    await store.getState().commit()

    expect(setAreaMock).toHaveBeenCalledWith('sync', 'k', expect.anything())
  })

  it('migrates a legacy local envelope into sync on first init', async () => {
    const legacy = { meta: { originId: 'old', rev: 5, ts: 1 }, state: { count: 42 } }
    // sync empty, local holds the legacy copy from older versions.
    getAreaMock.mockImplementation(async (area: string) => (area === 'local' ? legacy : null))

    const store = createStore(
      withChromeSync({
        key: 'k',
        area: 'sync',
        schema,
        partialize: (s: { count: number }) => ({ count: s.count }),
        merge: (_c, p) => p,
        autoPersist: false,
      })(() => ({ count: 0 })),
    )

    await flush()

    expect(store.getState().count).toBe(42)
    expect(setAreaMock).toHaveBeenCalledWith('sync', 'k', legacy)
  })

  describe('dynamic area resolver', () => {
    const dynSchema = z.object({
      meta: z.object({ originId: z.string(), rev: z.number(), ts: z.number() }),
      state: z.object({ count: z.number(), secret: z.boolean() }),
    })
    type DynState = { count: number; secret: boolean }
    const makeStore = () =>
      createStore(
        withChromeSync<DynState, DynState>({
          key: 'k',
          area: (s) => (s.secret ? 'local' : 'sync'),
          schema: dynSchema,
          partialize: (s) => ({ count: s.count, secret: s.secret }),
          merge: (_c, p) => p,
          autoPersist: false,
        })(() => ({ count: 0, secret: false })),
      )

    it('prefers the local copy when it pins the store to local (secrets stay device-local)', async () => {
      const localEnv = { meta: { originId: 'l', rev: 1, ts: 1 }, state: { count: 5, secret: true } }
      const syncEnv = { meta: { originId: 's', rev: 9, ts: 9 }, state: { count: 9, secret: false } }
      getAreaMock.mockImplementation(async (area: string) =>
        area === 'local' ? localEnv : syncEnv,
      )

      const store = makeStore()
      await flush()

      expect(store.getState().count).toBe(5)
      expect(store.getState().secret).toBe(true)
    })

    it('prefers the sync copy when local does not pin to local', async () => {
      const localEnv = {
        meta: { originId: 'l', rev: 1, ts: 1 },
        state: { count: 5, secret: false },
      }
      const syncEnv = { meta: { originId: 's', rev: 9, ts: 9 }, state: { count: 9, secret: false } }
      getAreaMock.mockImplementation(async (area: string) =>
        area === 'local' ? localEnv : syncEnv,
      )

      const store = makeStore()
      await flush()

      expect(store.getState().count).toBe(9)
    })

    it('routes writes to the area resolved from current state', async () => {
      getAreaMock.mockResolvedValue(null)
      const store = makeStore()
      await flush()

      await store.getState().commit()
      expect(setAreaMock).toHaveBeenLastCalledWith('sync', 'k', expect.anything())

      store.setState({ secret: true })
      await store.getState().commit()
      expect(setAreaMock).toHaveBeenLastCalledWith('local', 'k', expect.anything())
    })
  })
})
