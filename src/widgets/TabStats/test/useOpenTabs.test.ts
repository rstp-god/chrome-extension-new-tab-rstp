/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface StubListenerRegistry {
  onCreated: Array<() => void>
  onRemoved: Array<() => void>
  onUpdated: Array<(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => void>
}

function buildStubChrome(registry: StubListenerRegistry, tabs: chrome.tabs.Tab[]) {
  return {
    tabs: {
      query: vi.fn(async () => tabs),
      onCreated: {
        addListener: (fn: () => void) => {
          registry.onCreated.push(fn)
        },
        removeListener: (fn: () => void) => {
          const i = registry.onCreated.indexOf(fn)
          if (i >= 0) registry.onCreated.splice(i, 1)
        },
      },
      onRemoved: {
        addListener: (fn: () => void) => {
          registry.onRemoved.push(fn)
        },
        removeListener: (fn: () => void) => {
          const i = registry.onRemoved.indexOf(fn)
          if (i >= 0) registry.onRemoved.splice(i, 1)
        },
      },
      onUpdated: {
        addListener: (
          fn: (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => void,
        ) => {
          registry.onUpdated.push(fn)
        },
        removeListener: (
          fn: (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => void,
        ) => {
          const i = registry.onUpdated.indexOf(fn)
          if (i >= 0) registry.onUpdated.splice(i, 1)
        },
      },
    },
  }
}

let registry: StubListenerRegistry
let tabs: chrome.tabs.Tab[]
let stubChrome: ReturnType<typeof buildStubChrome> | null

beforeEach(() => {
  registry = { onCreated: [], onRemoved: [], onUpdated: [] }
  tabs = [
    { id: 1, discarded: false } as chrome.tabs.Tab,
    { id: 2, discarded: true } as chrome.tabs.Tab,
    { id: 3, discarded: false } as chrome.tabs.Tab,
  ]
  stubChrome = buildStubChrome(registry, tabs)
  vi.doMock('@/services/chrome/runtime.ts', () => ({
    getChromeObject: () => stubChrome,
    isShowcaseMode: () => false,
    hasChromeStorageApi: () => false,
    hasChromeStorageEvents: () => false,
  }))
})

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@/services/chrome/runtime.ts')
  stubChrome = null
})

describe('useOpenTabs', () => {
  it('attaches three listeners on mount and detaches them on unmount', async () => {
    const { useOpenTabs } = await import('@/widgets/TabStats/hooks/useOpenTabs.ts')
    const { unmount } = renderHook(() => useOpenTabs())

    expect(registry.onCreated).toHaveLength(1)
    expect(registry.onRemoved).toHaveLength(1)
    expect(registry.onUpdated).toHaveLength(1)

    unmount()
    expect(registry.onCreated).toHaveLength(0)
    expect(registry.onRemoved).toHaveLength(0)
    expect(registry.onUpdated).toHaveLength(0)
  })

  it('computes total + discarded from the initial query', async () => {
    const { useOpenTabs } = await import('@/widgets/TabStats/hooks/useOpenTabs.ts')
    const { result } = renderHook(() => useOpenTabs())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.total).toBe(3)
    expect(result.current.discarded).toBe(1)
  })

  it('ignores onUpdated calls without a discarded change (perf hygiene)', async () => {
    const { useOpenTabs } = await import('@/widgets/TabStats/hooks/useOpenTabs.ts')
    renderHook(() => useOpenTabs())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const queryFn = stubChrome!.tabs.query
    const initialQueryCount = queryFn.mock.calls.length

    // Irrelevant change — URL change should NOT trigger a re-query.
    act(() => {
      registry.onUpdated[0](1, { url: 'https://example.com/new' })
    })
    expect(queryFn.mock.calls.length).toBe(initialQueryCount)

    // Discarded flip IS relevant.
    act(() => {
      registry.onUpdated[0](1, { discarded: true })
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(queryFn.mock.calls.length).toBe(initialQueryCount + 1)
  })

  it('returns zeros when chrome.tabs is unavailable (showcase mode)', async () => {
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      getChromeObject: () => null,
      isShowcaseMode: () => true,
      hasChromeStorageApi: () => false,
      hasChromeStorageEvents: () => false,
    }))
    vi.resetModules()
    const { useOpenTabs } = await import('@/widgets/TabStats/hooks/useOpenTabs.ts')
    const { result } = renderHook(() => useOpenTabs())
    expect(result.current.total).toBe(0)
    expect(result.current.discarded).toBe(0)
  })
})
