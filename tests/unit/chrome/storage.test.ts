import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('chrome storage wrapper', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      isShowcaseMode: () => true,
      hasChromeStorageApi: () => false,
      getChromeObject: () => null,
    }))
  })

  it('uses memory storage in showcase mode via getLocal/setLocal', async () => {
    const { setLocal, getLocal } = await import('@/services/chrome/storage.ts')
    await setLocal('foo', { x: 1 })
    const value = await getLocal<{ x: number }>('foo')
    expect(value).toEqual({ x: 1 })
  })

  it('round-trips through area-aware getArea/setArea', async () => {
    const { setArea, getArea } = await import('@/services/chrome/storage.ts')
    await setArea('sync', 'bar', { y: 2 })
    expect(await getArea<{ y: number }>('sync', 'bar')).toEqual({ y: 2 })
  })

  it('removeArea deletes a key', async () => {
    const { setArea, getArea, removeArea } = await import('@/services/chrome/storage.ts')
    await setArea('sync', 'baz', { z: 3 })
    await removeArea('sync', 'baz')
    expect(await getArea('sync', 'baz')).toBeNull()
  })
})
