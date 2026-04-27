const ACTIVITY_STORAGE_KEY = 'tabRules:activity'

/**
 * Fallback "last touched" map used by the cleanup scheduler when
 * `chrome.tabs.Tab.lastAccessed` is unavailable (Chrome < 121). The
 * scheduler reads `tab.lastAccessed` first; this map is a safety net only.
 *
 * Writes are coalesced via `queueMicrotask` — multiple `markActive` calls
 * within the same event-loop tick collapse into one `chrome.storage.local.set`.
 * This keeps us under Chrome's 120-writes-per-minute storage quota when the
 * user keyboard-cycles tabs rapidly, without re-introducing the original
 * `setTimeout`-based debounce bug: setTimeout doesn't survive MV3's ~30s
 * worker suspension, but microtasks run before the worker can yield, so
 * the persist always lands.
 *
 * No `withLock`: persist reads the *current* in-memory map at write time,
 * so concurrent calls converge on the same final on-disk state. Last-writer-
 * wins is acceptable here (unlike the activity feature's RMW append-raw flow,
 * which uses `withLock` because it merges old + new).
 */

const lastActive = new Map<number, number>()
let persistScheduled = false

export function getLastActive(tabId: number): number | undefined {
  return lastActive.get(tabId)
}

export function markActive(tabId: number): void {
  lastActive.set(tabId, Date.now())
  schedulePersist()
}

export function removeTab(tabId: number): void {
  if (!lastActive.has(tabId)) return
  lastActive.delete(tabId)
  schedulePersist()
}

function schedulePersist(): void {
  if (persistScheduled) return
  persistScheduled = true
  queueMicrotask(() => {
    persistScheduled = false
    persistToStorage().catch((err: unknown) => {
      console.warn('[cleanup] persist failed', err)
    })
  })
}

async function persistToStorage(): Promise<void> {
  const data: Record<string, number> = {}
  for (const [tabId, ts] of lastActive) {
    data[String(tabId)] = ts
  }
  await chrome.storage.local.set({ [ACTIVITY_STORAGE_KEY]: data })
}

export async function restoreFromStorage(): Promise<void> {
  const result = await chrome.storage.local.get(ACTIVITY_STORAGE_KEY)
  const data = result[ACTIVITY_STORAGE_KEY]
  if (!data || typeof data !== 'object') return
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === 'number') {
      lastActive.set(Number(key), value)
    }
  }
}

export function setupActivityTracking(): void {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    markActive(tabId)
  })

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) {
      markActive(tab.id)
    }
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    removeTab(tabId)
  })
  // Deliberately do NOT prime existing tabs with `Date.now()` here. That was
  // the second half of the original bug: every worker wake would mark every
  // open tab as freshly active, so `now - lastActive` was always ~0 and no
  // tab ever crossed the threshold. `chrome.tabs.lastAccessed` covers the
  // common case; tabs missing from both sources are treated as "just touched"
  // by the scheduler — uncertain provenance should never close a tab.
}

export function __resetForTests(): void {
  lastActive.clear()
}
