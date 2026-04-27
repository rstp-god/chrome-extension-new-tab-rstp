import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetForTests, markActive } from '@/background/cleanup/activityTracker.ts'
import { runCleanupCheck } from '@/background/cleanup/scheduler.ts'
import type { TabRulesSettings } from '@/popup/types/rules.ts'
import { DEFAULT_TAB_RULES_SETTINGS } from '@/popup/types/rules.ts'

/**
 * Tests for the cleanup eligibility logic. Drives `runCleanupCheck` against
 * a stubbed `chrome.tabs` and verifies which tabs get closed (auto mode) or
 * notified about (ask mode). Threshold semantics are wall-clock days from
 * `tab.lastAccessed`, with the in-memory tracker map as a Chrome <121 fallback.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const BASE_TIME = new Date('2026-04-27T15:57:00Z').getTime()

const removedIds: number[] = []
const notifiedIds: number[] = []
let tabs: chrome.tabs.Tab[] = []

function makeTab(partial: Partial<chrome.tabs.Tab> & { id: number }): chrome.tabs.Tab {
  return {
    index: 0,
    pinned: false,
    highlighted: false,
    windowId: 1,
    active: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    url: 'https://example.com/',
    title: 'Example',
    ...partial,
  } as chrome.tabs.Tab
}

function installChromeMock(): void {
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    tabs: {
      query: async () => tabs,
      remove: async (ids: number | number[]) => {
        const list = Array.isArray(ids) ? ids : [ids]
        for (const id of list) removedIds.push(id)
      },
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {
          /* no-op */
        },
      },
    },
    notifications: {
      create: (id: string) => {
        const tabId = Number(id.replace('cleanup-tab-', ''))
        if (!Number.isNaN(tabId)) notifiedIds.push(tabId)
      },
    },
    alarms: {
      create: () => {
        /* no-op */
      },
      onAlarm: { addListener: () => undefined },
    },
  }
}

function settingsWith(overrides: Partial<TabRulesSettings['cleanup']>): () => TabRulesSettings {
  const s: TabRulesSettings = {
    ...DEFAULT_TAB_RULES_SETTINGS,
    cleanup: { ...DEFAULT_TAB_RULES_SETTINGS.cleanup, ...overrides },
  }
  return () => s
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE_TIME)
  removedIds.length = 0
  notifiedIds.length = 0
  tabs = []
  __resetForTests()
  installChromeMock()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runCleanupCheck — eligibility', () => {
  it('is a no-op when cleanup is disabled', async () => {
    tabs = [
      makeTab({ id: 1, lastAccessed: BASE_TIME - 30 * ONE_DAY_MS, url: 'https://stale.com/' }),
    ]
    await runCleanupCheck(settingsWith({ enabled: false, threshold: '7d', mode: 'auto' }))
    expect(removedIds).toEqual([])
  })

  it('closes tabs older than the threshold in auto mode', async () => {
    // Threshold 4d; tab opened 5 days ago, never re-accessed.
    tabs = [
      makeTab({
        id: 42,
        lastAccessed: BASE_TIME - 5 * ONE_DAY_MS,
        url: 'https://stale.com/',
      }),
    ]
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '4d', mode: 'auto' }))
    expect(removedIds).toEqual([42])
  })

  it('keeps tabs younger than the threshold', async () => {
    tabs = [
      makeTab({
        id: 1,
        lastAccessed: BASE_TIME - 3 * ONE_DAY_MS,
        url: 'https://recent.com/',
      }),
    ]
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '4d', mode: 'auto' }))
    expect(removedIds).toEqual([])
  })

  it('matches the user scenario: opened 27 Apr 15:57, threshold 4d → eligible 1 May 15:57', async () => {
    const opened = new Date('2026-04-27T15:57:00Z').getTime()
    tabs = [makeTab({ id: 9, lastAccessed: opened, url: 'https://docs.com/' })]

    // 1 minute before — not yet eligible.
    vi.setSystemTime(opened + 4 * ONE_DAY_MS - 60_000)
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '4d', mode: 'auto' }))
    expect(removedIds).toEqual([])

    // Threshold reached — eligible.
    vi.setSystemTime(opened + 4 * ONE_DAY_MS + 60_000)
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '4d', mode: 'auto' }))
    expect(removedIds).toEqual([9])
  })
})

describe('runCleanupCheck — exclusions', () => {
  it('skips pinned tabs', async () => {
    tabs = [
      makeTab({
        id: 1,
        pinned: true,
        lastAccessed: BASE_TIME - 30 * ONE_DAY_MS,
        url: 'https://pinned.com/',
      }),
    ]
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '7d', mode: 'auto' }))
    expect(removedIds).toEqual([])
  })

  it('skips the currently-active tab', async () => {
    tabs = [
      makeTab({
        id: 1,
        active: true,
        lastAccessed: BASE_TIME - 30 * ONE_DAY_MS,
        url: 'https://active.com/',
      }),
    ]
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '7d', mode: 'auto' }))
    expect(removedIds).toEqual([])
  })

  it('skips chrome:// and other system URLs', async () => {
    tabs = [
      makeTab({
        id: 1,
        lastAccessed: BASE_TIME - 30 * ONE_DAY_MS,
        url: 'chrome://settings/',
      }),
      makeTab({
        id: 2,
        lastAccessed: BASE_TIME - 30 * ONE_DAY_MS,
        url: 'chrome-extension://abc/index.html',
      }),
    ]
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '7d', mode: 'auto' }))
    expect(removedIds).toEqual([])
  })

  it('does NOT exclude grouped tabs — groups are eligible too', async () => {
    tabs = [
      makeTab({
        id: 1,
        groupId: 100,
        lastAccessed: BASE_TIME - 10 * ONE_DAY_MS,
        url: 'https://grouped.com/',
      }),
    ]
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '7d', mode: 'auto' }))
    expect(removedIds).toEqual([1])
  })
})

describe('runCleanupCheck — modes', () => {
  it('ask mode raises notifications instead of closing', async () => {
    tabs = [
      makeTab({ id: 7, lastAccessed: BASE_TIME - 30 * ONE_DAY_MS, url: 'https://stale.com/' }),
    ]
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '7d', mode: 'ask' }))
    expect(removedIds).toEqual([])
    expect(notifiedIds).toEqual([7])
  })
})

describe('runCleanupCheck — fallback to tracker map', () => {
  it('uses the tracker map when lastAccessed is missing (older Chrome)', async () => {
    markActive(5)
    // Pretend the tracker recorded activity 30 days ago by overwriting now
    // with a fake clock and re-marking.
    vi.setSystemTime(BASE_TIME - 30 * ONE_DAY_MS)
    markActive(5)
    vi.setSystemTime(BASE_TIME)

    tabs = [makeTab({ id: 5, lastAccessed: undefined, url: 'https://old.com/' })]
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '7d', mode: 'auto' }))
    expect(removedIds).toEqual([5])
  })

  it('does not close a tab unknown to both Chrome and the tracker', async () => {
    // No lastAccessed, no tracker entry → uncertain provenance, must keep.
    tabs = [makeTab({ id: 99, lastAccessed: undefined, url: 'https://unknown.com/' })]
    await runCleanupCheck(settingsWith({ enabled: true, threshold: '1d', mode: 'auto' }))
    expect(removedIds).toEqual([])
  })
})
