import { MAX_SESSION_DURATION_MS } from '@/background/activity/constants.ts'
import { extractDomain } from '@/background/activity/tracker/domain.ts'
import { dispatchEvent, type SettingsGetter } from '@/background/activity/tracker/dispatch.ts'
import {
  endActiveSession,
  startSession,
} from '@/background/activity/tracker/session.ts'
import { state } from '@/background/activity/tracker/state.ts'

/**
 * One named function per chrome.* event we care about. `registerTabListeners`
 * wires them up — keeping `setupActivityTracking` in the parent file small.
 */

async function resolveDomain(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId)
    return extractDomain(tab.url)
  } catch (err) {
    // Tab was closed between the event firing and our resolution — expected,
    // log at warn for visibility without spamming on real errors.
    console.warn('[activity] resolveDomain failed for tab', tabId, err)
    return null
  }
}

export function handleTabActivated(
  { tabId }: chrome.tabs.OnActivatedInfo,
  settingsGetter: SettingsGetter,
): void {
  const now = Date.now()
  const seq = ++state.activationSeq
  endActiveSession(now, 'tab_activated', settingsGetter)

  // Fast path: use cached domain if known.
  const cached = state.tabDomain.get(tabId)
  if (cached) {
    startSession(tabId, cached, Date.now(), settingsGetter)
    return
  }

  // Slow path: resolve async, but abort if a newer event superseded us.
  void resolveDomain(tabId).then((domain) => {
    if (seq !== state.activationSeq) return
    if (!domain) return
    startSession(tabId, domain, Date.now(), settingsGetter)
  })
}

export function handleTabCreated(
  tab: chrome.tabs.Tab,
  settingsGetter: SettingsGetter,
): void {
  if (tab.id === undefined) return
  const now = Date.now()
  state.tabCreatedAt.set(tab.id, now)
  const domain = extractDomain(tab.url)
  if (!domain) return
  state.tabDomain.set(tab.id, domain)
  dispatchEvent(
    { timestamp: now, domain, tabId: tab.id, eventType: 'tab_created' },
    settingsGetter,
  )
}

export function handleTabRemoved(tabId: number, settingsGetter: SettingsGetter): void {
  const now = Date.now()
  state.activationSeq += 1
  if (state.activeSession?.tabId === tabId) {
    endActiveSession(now, 'tab_activated', settingsGetter)
  }
  const createdAt = state.tabCreatedAt.get(tabId)
  const domain = state.tabDomain.get(tabId)
  state.tabCreatedAt.delete(tabId)
  state.tabDomain.delete(tabId)

  // Only record close when we know the domain — 'unknown' would pollute metrics.
  if (!domain) return

  if (createdAt !== undefined) {
    const lifetime = Math.max(0, Math.min(MAX_SESSION_DURATION_MS, now - createdAt))
    dispatchEvent(
      { timestamp: now, domain, tabId, eventType: 'tab_closed', duration: lifetime },
      settingsGetter,
    )
  } else {
    // Tab predates worker boot — record close but leave avgLifetime untouched.
    dispatchEvent(
      { timestamp: now, domain, tabId, eventType: 'tab_closed' },
      settingsGetter,
    )
  }
}

export function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.OnUpdatedInfo,
  tab: chrome.tabs.Tab,
  settingsGetter: SettingsGetter,
): void {
  if (changeInfo.url === undefined) return
  const newDomain = extractDomain(tab.url)
  state.activationSeq += 1
  if (!newDomain) {
    // Navigated to non-HTTP(S) — end session if this tab was active.
    if (state.activeSession?.tabId === tabId) {
      endActiveSession(Date.now(), 'tab_navigated', settingsGetter)
    }
    state.tabDomain.delete(tabId)
    return
  }
  const prevDomain = state.tabDomain.get(tabId)
  if (prevDomain === newDomain) return
  const now = Date.now()
  if (state.activeSession?.tabId === tabId) {
    endActiveSession(now, 'tab_navigated', settingsGetter)
    startSession(tabId, newDomain, now, settingsGetter)
  } else {
    state.tabDomain.set(tabId, newDomain)
  }
}

export function handleWindowFocusChanged(
  windowId: number,
  settingsGetter: SettingsGetter,
): void {
  const now = Date.now()
  const seq = ++state.activationSeq
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    endActiveSession(now, 'window_focus', settingsGetter)
    return
  }
  endActiveSession(now, 'window_focus', settingsGetter)
  chrome.tabs
    .query({ active: true, windowId })
    .then((tabs) => {
      if (seq !== state.activationSeq) return
      const tab = tabs[0]
      if (!tab || tab.id === undefined) return
      const domain = extractDomain(tab.url)
      if (!domain) return
      startSession(tab.id, domain, Date.now(), settingsGetter)
    })
    .catch((err: unknown) => {
      console.warn('[activity] focus query failed', err)
    })
}

/** Prime tabDomain for tabs that existed before the worker started. */
export async function primeExistingTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (tab.id === undefined) continue
      const domain = extractDomain(tab.url)
      if (domain) state.tabDomain.set(tab.id, domain)
    }
  } catch (err) {
    console.warn('[activity] tab priming failed', err)
  }
}

export function registerTabListeners(settingsGetter: SettingsGetter): void {
  chrome.tabs.onActivated.addListener((info) => handleTabActivated(info, settingsGetter))
  chrome.tabs.onCreated.addListener((tab) => handleTabCreated(tab, settingsGetter))
  chrome.tabs.onRemoved.addListener((tabId) => handleTabRemoved(tabId, settingsGetter))
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) =>
    handleTabUpdated(tabId, changeInfo, tab, settingsGetter),
  )
  chrome.windows.onFocusChanged.addListener((windowId) =>
    handleWindowFocusChanged(windowId, settingsGetter),
  )
}
