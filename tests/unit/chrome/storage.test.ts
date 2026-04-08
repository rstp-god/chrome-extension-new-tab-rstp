import { describe, expect, it, vi } from 'vitest'

describe('chrome storage wrapper', () => {
  it('uses memory storage in showcase mode', async () => {
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      isShowcaseMode: () => true,
      hasChromeStorageApi: () => false,
      getChromeObject: () => null,
    }))

    const { setLocal, getLocal } = await import('@/services/chrome/storage.ts')
    await setLocal('foo', { x: 1 })
    const value = await getLocal<{ x: number }>('foo')
    expect(value).toEqual({ x: 1 })
  })
})
