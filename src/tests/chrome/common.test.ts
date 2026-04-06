import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

describe('openUrlInNewTab', () => {
  it('uses window.open as fallback when tabs.create is unavailable', async () => {
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      getChromeObject: () => null,
    }))

    const openSpy = vi.fn()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { open: openSpy },
    })

    const { openUrlInNewTab } = await import('@/services/chrome/common.ts')

    await openUrlInNewTab('https://example.com')

    expect(openSpy).toHaveBeenCalledOnce()
  })
})
