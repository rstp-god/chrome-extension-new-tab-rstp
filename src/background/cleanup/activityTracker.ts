const ACTIVITY_STORAGE_KEY = 'tabRules:activity'
const PERSIST_INTERVAL_MS = 60_000

const lastActive = new Map<number, number>()
let persistTimer: ReturnType<typeof setTimeout> | null = null

export function getLastActive(tabId: number): number | undefined {
  return lastActive.get(tabId)
}

export function markActive(tabId: number): void {
  lastActive.set(tabId, Date.now())
  schedulePersist()
}

export function removeTab(tabId: number): void {
  lastActive.delete(tabId)
}

export function getInactiveTabs(thresholdMs: number): number[] {
  const now = Date.now()
  const result: number[] = []
  for (const [tabId, ts] of lastActive) {
    if (now - ts > thresholdMs) {
      result.push(tabId)
    }
  }
  return result
}

function schedulePersist(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    void persistToStorage()
  }, PERSIST_INTERVAL_MS)
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
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof value === 'number') {
        lastActive.set(Number(key), value)
      }
    }
  }
}

export function setupActivityTracking(): void {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    markActive(tabId)
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    removeTab(tabId)
  })

  // Initialize all existing tabs
  chrome.tabs.query({}).then((tabs) => {
    const now = Date.now()
    for (const tab of tabs) {
      if (tab.id !== undefined && !lastActive.has(tab.id)) {
        lastActive.set(tab.id, now)
      }
    }
  })
}
