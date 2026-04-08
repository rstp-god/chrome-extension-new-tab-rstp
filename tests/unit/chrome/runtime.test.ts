import { describe, expect, it, vi } from 'vitest'
import { createChromeMock, installChromeMock } from '@tests/mocks/chrome.ts'

describe('runtime helpers', () => {
  it('returns chrome object when present', async () => {
    const runtime = await import('@/services/chrome/runtime.ts')
    const chromeMock = createChromeMock()
    installChromeMock(chromeMock)

    expect(runtime.getChromeObject()).toBe(chromeMock)
    expect(runtime.hasChromeStorageApi()).toBe(true)
  })

  it('returns null when chrome object absent', async () => {
    const runtime = await import('@/services/chrome/runtime.ts')
    Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })

    expect(runtime.getChromeObject()).toBeNull()
    expect(runtime.hasChromeStorageApi()).toBe(false)
    expect(runtime.hasChromeStorageEvents()).toBe(false)
  })

  it('resolves runtime mode as extension by default', async () => {
    vi.stubEnv('VITE_RUNTIME_MODE', '')
    const runtime = await import('@/services/chrome/runtime.ts')
    expect(runtime.getRuntimeMode()).toBe('extension')
  })
})
