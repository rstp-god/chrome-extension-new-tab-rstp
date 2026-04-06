import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand'
import { withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import { z } from 'zod'

const getLocalMock = vi.hoisted(() => vi.fn<() => Promise<unknown>>(async () => null))
const setLocalMock = vi.hoisted(() => vi.fn<(key: string, value: unknown) => Promise<void>>(async () => {}))

vi.mock('@/services/chrome/runtime.ts', () => ({
  isShowcaseMode: () => true,
  hasChromeStorageEvents: () => false,
  getChromeObject: () => null,
}))

vi.mock('@/services/chrome/storage.ts', () => ({
  getLocal: getLocalMock,
  setLocal: setLocalMock,
}))

const schema = z.object({
  meta: z.object({ originId: z.string(), rev: z.number(), ts: z.number() }),
  state: z.object({ count: z.number() }),
})

describe('withChromeSync', () => {
  beforeEach(() => {
    getLocalMock.mockReset()
    setLocalMock.mockReset()
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
    expect(setLocalMock).toHaveBeenCalledOnce()
  })

  it('hydrates state from storage envelope on init', async () => {
    getLocalMock.mockResolvedValueOnce({
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

    await Promise.resolve()
    await Promise.resolve()

    expect(store.getState().count).toBe(7)
  })
})
