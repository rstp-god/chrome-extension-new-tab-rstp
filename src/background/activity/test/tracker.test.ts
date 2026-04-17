import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivitySettings } from '@/background/activity/types.ts'
import { DEFAULT_ACTIVITY_SETTINGS } from '@/background/activity/types.ts'
import {
  emitHeartbeat,
  emptyAll,
  emptyDay,
  emptyWeek,
  extractDomain,
  onPauseChanged,
  setupActivityTracking,
} from '@/background/activity/tracker.ts'
import {
  __peekStateForTests,
  __resetTrackerForTests,
  __seedSnapshotsForTests,
} from '@/background/activity/tracker/testing.ts'

/**
 * Tracker tests. Two tiers:
 *   1. Pure helpers (`extractDomain`) — direct input/output assertions.
 *   2. State-machine behavior — we stub `chrome.*` in the module-scope globals,
 *      register listeners via `setupActivityTracking`, then synchronously
 *      invoke the captured listener functions to drive scripted scenarios.
 *
 * Chrome-API wiring beyond what's exercised here (resolveDomain race,
 * window.onFocusChanged across windows) is covered by Playwright in Stage 8.
 */

// --- extractDomain (pure) ---

describe('extractDomain', () => {
  it('returns hostname for http(s) URLs', () => {
    expect(extractDomain('https://github.com/foo')).toBe('github.com')
    expect(extractDomain('http://example.com:8080/path')).toBe('example.com')
    expect(extractDomain('https://sub.domain.co.uk/')).toBe('sub.domain.co.uk')
  })

  it('rejects chrome:// and extension pages (privacy — never tracked)', () => {
    expect(extractDomain('chrome://settings/')).toBeNull()
    expect(extractDomain('chrome://extensions')).toBeNull()
    expect(extractDomain('chrome-extension://abcdef/index.html')).toBeNull()
    expect(extractDomain('about:blank')).toBeNull()
    expect(extractDomain('file:///Users/me/file.html')).toBeNull()
    expect(extractDomain('edge://settings')).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(extractDomain('not-a-url')).toBeNull()
    expect(extractDomain('')).toBeNull()
    expect(extractDomain(undefined)).toBeNull()
  })

  it('normalizes hostnames: lowercases and strips trailing dot', () => {
    expect(extractDomain('https://GitHub.com/foo')).toBe('github.com')
    expect(extractDomain('https://example.com./')).toBe('example.com')
    expect(extractDomain('https://EXAMPLE.COM./')).toBe('example.com')
  })

  it('preserves punycode hosts as-is (no Unicode normalization)', () => {
    expect(extractDomain('https://xn--bcher-kva.example/')).toBe('xn--bcher-kva.example')
  })

  it('returns null for prototype-pollution hostnames (defensive)', () => {
    // URL.hostname can't actually produce these, but we guard anyway.
    expect(extractDomain('https://__proto__/')).toBeNull()
    expect(extractDomain('https://constructor/')).toBeNull()
  })
})

// --- State-machine (stubbed chrome.*) ---

type Listener<T extends unknown[]> = (...args: T) => void

interface MockChrome {
  tabs: {
    onActivated: { addListener: (fn: Listener<[chrome.tabs.OnActivatedInfo]>) => void }
    onCreated: { addListener: (fn: Listener<[chrome.tabs.Tab]>) => void }
    onRemoved: {
      addListener: (fn: Listener<[number, chrome.tabs.OnRemovedInfo]>) => void
    }
    onUpdated: {
      addListener: (
        fn: Listener<[number, chrome.tabs.OnUpdatedInfo, chrome.tabs.Tab]>,
      ) => void
    }
    get: (tabId: number) => Promise<chrome.tabs.Tab>
    query: (info: Partial<chrome.tabs.QueryInfo>) => Promise<chrome.tabs.Tab[]>
  }
  windows: {
    onFocusChanged: { addListener: (fn: Listener<[number]>) => void }
    onRemoved: { addListener: (fn: Listener<[number]>) => void }
    getAll: () => Promise<chrome.windows.Window[]>
    WINDOW_ID_NONE: number
  }
  idle: {
    setDetectionInterval: (sec: number) => void
    onStateChanged: {
      addListener: (fn: Listener<['active' | 'idle' | 'locked']>) => void
    }
  }
  runtime: {
    onSuspend: { addListener: (fn: Listener<[]>) => void }
  }
  storage: {
    local: {
      get: (keys?: string | string[]) => Promise<Record<string, unknown>>
      set: (items: Record<string, unknown>) => Promise<void>
    }
    onChanged: { addListener: (fn: Listener<[unknown, string]>) => void }
  }
}

interface Listeners {
  onActivated?: Listener<[chrome.tabs.OnActivatedInfo]>
  onCreated?: Listener<[chrome.tabs.Tab]>
  onRemoved?: Listener<[number, chrome.tabs.OnRemovedInfo]>
  onUpdated?: Listener<
    [number, chrome.tabs.OnUpdatedInfo, chrome.tabs.Tab]
  >
  onFocusChanged?: Listener<[number]>
  onWindowRemoved?: Listener<[number]>
  onIdleStateChanged?: Listener<['active' | 'idle' | 'locked']>
  onSuspend?: Listener<[]>
}

const listeners: Listeners = {}
const tabUrls = new Map<number, string>()
const openWindows: chrome.windows.Window[] = []

function installChromeMock(): void {
  const mockChrome: MockChrome = {
    tabs: {
      onActivated: {
        addListener: (fn) => {
          listeners.onActivated = fn
        },
      },
      onCreated: {
        addListener: (fn) => {
          listeners.onCreated = fn
        },
      },
      onRemoved: {
        addListener: (fn) => {
          listeners.onRemoved = fn
        },
      },
      onUpdated: {
        addListener: (fn) => {
          listeners.onUpdated = fn
        },
      },
      get: async (tabId: number) => {
        const url = tabUrls.get(tabId)
        if (url === undefined) throw new Error('no tab')
        return { id: tabId, url } as chrome.tabs.Tab
      },
      query: async (info: Partial<chrome.tabs.QueryInfo>) => {
        if (info.active && info.lastFocusedWindow) {
          // Return the first known tab as the focused one.
          const first = [...tabUrls.entries()][0]
          if (!first) return []
          return [{ id: first[0], url: first[1] } as chrome.tabs.Tab]
        }
        return []
      },
    },
    windows: {
      onFocusChanged: {
        addListener: (fn) => {
          listeners.onFocusChanged = fn
        },
      },
      onRemoved: {
        addListener: (fn) => {
          listeners.onWindowRemoved = fn
        },
      },
      getAll: async () => [...openWindows],
      WINDOW_ID_NONE: -1,
    },
    idle: {
      setDetectionInterval: () => {
        /* no-op */
      },
      onStateChanged: {
        addListener: (fn) => {
          listeners.onIdleStateChanged = fn
        },
      },
    },
    runtime: {
      onSuspend: {
        addListener: (fn) => {
          listeners.onSuspend = fn
        },
      },
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {
          /* no-op */
        },
      },
      onChanged: {
        addListener: () => {
          /* no-op */
        },
      },
    },
  }
  ;(globalThis as unknown as { chrome: MockChrome }).chrome = mockChrome
}

function makeSettings(paused = false): () => ActivitySettings {
  const s: ActivitySettings = { ...DEFAULT_ACTIVITY_SETTINGS, paused }
  return () => s
}

function seedFreshSnapshots(now: number): void {
  __seedSnapshotsForTests(emptyDay(now), emptyWeek(now), emptyAll())
}

const BASE_TIME = new Date('2026-04-16T10:00:00').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE_TIME)
  __resetTrackerForTests()
  listeners.onActivated = undefined
  listeners.onCreated = undefined
  listeners.onRemoved = undefined
  listeners.onUpdated = undefined
  listeners.onFocusChanged = undefined
  listeners.onWindowRemoved = undefined
  listeners.onIdleStateChanged = undefined
  listeners.onSuspend = undefined
  tabUrls.clear()
  openWindows.length = 0
  installChromeMock()
})

afterEach(() => {
  __resetTrackerForTests()
  vi.useRealTimers()
})

describe('tracker state machine', () => {
  it('onActivated → onActivated emits a duration event for the first tab', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    tabUrls.set(2, 'https://b.com/')

    listeners.onActivated!({ tabId: 1, windowId: 1 })
    // Flush the async `resolveDomain` chain.
    await Promise.resolve()
    await Promise.resolve()
    expect(__peekStateForTests().activeSession?.domain).toBe('a.com')

    vi.setSystemTime(BASE_TIME + 60_000) // 60s later
    listeners.onActivated!({ tabId: 2, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    const { activeSession, pendingRaw } = __peekStateForTests()
    expect(activeSession?.domain).toBe('b.com')
    // Expect one durational event for the ended a.com session.
    expect(pendingRaw.some((e) => e.domain === 'a.com' && e.duration === 60_000)).toBe(
      true,
    )
  })

  it('paused=true blocks new sessions and event dispatch', async () => {
    setupActivityTracking(makeSettings(true))
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    const { activeSession, pendingRaw } = __peekStateForTests()
    expect(activeSession).toBeNull()
    expect(pendingRaw).toEqual([])
  })

  it('onPauseChanged(true) drops the active session without emitting its duration', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()
    expect(__peekStateForTests().activeSession).not.toBeNull()

    vi.setSystemTime(BASE_TIME + 5 * 60_000)
    onPauseChanged(true)

    const { activeSession, pendingRaw } = __peekStateForTests()
    expect(activeSession).toBeNull()
    // The 5 minutes accumulated while pre-pause must NOT leak into raw.
    expect(pendingRaw.some((e) => e.duration && e.duration > 0)).toBe(false)
  })

  it('onRemoved of the active tab ends the session and emits tab_closed', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    // Simulate a tab that was created during tracking.
    tabUrls.set(1, 'https://a.com/')
    listeners.onCreated!({ id: 1, url: 'https://a.com/' } as chrome.tabs.Tab)
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    vi.setSystemTime(BASE_TIME + 30_000)
    listeners.onRemoved!(1, { windowId: 1, isWindowClosing: false })

    const { activeSession, pendingRaw } = __peekStateForTests()
    expect(activeSession).toBeNull()
    const closedEvent = pendingRaw.find((e) => e.eventType === 'tab_closed')
    expect(closedEvent).toBeDefined()
    expect(closedEvent?.domain).toBe('a.com')
    expect(closedEvent?.duration).toBe(30_000)
  })

  it('onFocusChanged(WINDOW_ID_NONE) ends the session without starting a new one', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    vi.setSystemTime(BASE_TIME + 10_000)
    listeners.onFocusChanged!(-1)

    expect(__peekStateForTests().activeSession).toBeNull()
  })

  it('emitHeartbeat emits a slice and restarts the session clock', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    vi.setSystemTime(BASE_TIME + 3600_000) // 1h later
    emitHeartbeat(makeSettings())

    const { activeSession, pendingRaw } = __peekStateForTests()
    expect(activeSession?.domain).toBe('a.com')
    // startedAt should be reset to current time, so future heartbeats don't double-count.
    expect(activeSession?.startedAt).toBe(BASE_TIME + 3600_000)
    expect(pendingRaw.some((e) => e.duration === 3600_000)).toBe(true)
  })

  it('duration is clamped to 24h (clock skew / system sleep)', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    // Jump 5 days forward — simulating a long sleep / clock skew.
    vi.setSystemTime(BASE_TIME + 5 * 86_400_000)
    listeners.onFocusChanged!(-1)

    const { pendingRaw } = __peekStateForTests()
    const durational = pendingRaw.find((e) => e.duration !== undefined)
    expect(durational?.duration).toBe(24 * 60 * 60 * 1000)
  })
})

describe('idle detection', () => {
  it('idle state ends the session and blocks new sessions', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    vi.setSystemTime(BASE_TIME + 10 * 60_000) // 10 min later
    listeners.onIdleStateChanged!('idle')

    const afterIdle = __peekStateForTests()
    expect(afterIdle.activeSession).toBeNull()
    // Session ended at (now - 60s), so duration = 10min - 60s = 9min.
    const emitted = afterIdle.pendingRaw.find((e) => e.duration !== undefined)
    expect(emitted?.duration).toBe(9 * 60_000)

    // New activation while idle must not start a session.
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()
    expect(__peekStateForTests().activeSession).toBeNull()
  })

  it('locked state is treated like idle', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    vi.setSystemTime(BASE_TIME + 5 * 60_000)
    listeners.onIdleStateChanged!('locked')

    expect(__peekStateForTests().activeSession).toBeNull()
  })

  it('active state after idle restarts session from focused tab', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    listeners.onIdleStateChanged!('idle')
    expect(__peekStateForTests().activeSession).toBeNull()

    vi.setSystemTime(BASE_TIME + 20 * 60_000)
    listeners.onIdleStateChanged!('active')
    // Resolve chrome.tabs.query promise.
    await Promise.resolve()
    await Promise.resolve()

    const resumed = __peekStateForTests()
    expect(resumed.activeSession?.domain).toBe('a.com')
    expect(resumed.activeSession?.startedAt).toBe(BASE_TIME + 20 * 60_000)
  })
})

describe('lifecycle hooks', () => {
  it('onSuspend emits heartbeat for active session', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    vi.setSystemTime(BASE_TIME + 4 * 60_000) // 4 min — between heartbeats
    listeners.onSuspend!()

    const { activeSession, day } = __peekStateForTests()
    // Active session stays live (heartbeat restarts its clock).
    expect(activeSession?.domain).toBe('a.com')
    // The 4-minute slice landed in the day snapshot (pendingRaw is cleared by
    // flushPendingWrites before we can inspect it).
    expect(day?.totalsByDomain['a.com']?.totalTime).toBe(4 * 60)
  })

  it('windows.onRemoved with 0 remaining windows ends the session', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    vi.setSystemTime(BASE_TIME + 2 * 60_000)
    // openWindows is empty by default (no windows left).
    listeners.onWindowRemoved!(42)
    // handleWindowRemoved awaits chrome.windows.getAll before ending session.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const { activeSession, day } = __peekStateForTests()
    expect(activeSession).toBeNull()
    expect(day?.totalsByDomain['a.com']?.totalTime).toBe(2 * 60)
  })

  it('windows.onRemoved with remaining windows is a no-op for session', async () => {
    setupActivityTracking(makeSettings())
    seedFreshSnapshots(BASE_TIME)

    tabUrls.set(1, 'https://a.com/')
    listeners.onActivated!({ tabId: 1, windowId: 1 })
    await Promise.resolve()
    await Promise.resolve()

    openWindows.push({ id: 2 } as chrome.windows.Window)
    listeners.onWindowRemoved!(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(__peekStateForTests().activeSession?.domain).toBe('a.com')
  })
})
