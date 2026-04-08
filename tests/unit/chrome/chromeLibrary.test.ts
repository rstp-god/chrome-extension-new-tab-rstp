import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

describe('chromeLibrary service', () => {
  it('returns demo data in showcase mode', async () => {
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      isShowcaseMode: () => true,
      getChromeObject: () => null,
    }))

    const { getBookmarkTree, getTabGroupsWithTabs } =
      await import('@/services/chrome/chromeLibrary.ts')

    await expect(getBookmarkTree()).resolves.toHaveLength(2)
    await expect(getTabGroupsWithTabs()).resolves.toHaveLength(2)
  })

  it('returns empty arrays when chrome api unavailable', async () => {
    vi.doMock('@/services/chrome/runtime.ts', () => ({
      isShowcaseMode: () => false,
      getChromeObject: () => null,
    }))

    const { getBookmarkTree, getTabGroupsWithTabs } =
      await import('@/services/chrome/chromeLibrary.ts')

    await expect(getBookmarkTree()).resolves.toEqual([])
    await expect(getTabGroupsWithTabs()).resolves.toEqual([])
  })
})
