import { describe, expect, it, vi } from 'vitest'

describe('tabs service', () => {
  it('canLinkTab allows only http/https', async () => {
    const { canLinkTab } = await import('@/services/chrome/tabs.ts')

    expect(canLinkTab({ url: 'https://ok.com' } as chrome.tabs.Tab)).toBe(true)
    expect(canLinkTab({ url: 'chrome://settings' } as chrome.tabs.Tab)).toBe(false)
  })

  it('listLinkableTabs returns empty array when tabs api unavailable', async () => {
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      isShowcaseMode: () => false,
      getChromeObject: () => null,
    }))
    const { listLinkableTabs } = await import('@/services/chrome/tabs.ts')
    await expect(listLinkableTabs()).resolves.toEqual([])
  })
})
