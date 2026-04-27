import { MAX_SESSION_DURATION_MS } from '@/background/activity/constants.ts'
import { extractDomain } from '@/background/activity/tracker/domain.ts'
import { dispatchEvent, type SettingsGetter } from '@/background/activity/tracker/dispatch.ts'
import { endActiveSession, startSession } from '@/background/activity/tracker/session.ts'
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

/**
 * Start a session for `tabId`, using the cached domain if available or
 * resolving asynchronously. Aborts the slow path if a newer context-changing
 * event supersedes this one (guarded by `seq`). Shared by tab-activated and
 * window-focus handlers.
 */
function resumeSessionFor(
  tabId: number,
  seq: number,
  settingsGetter: SettingsGetter,
): void {
  const cached = state.tabDomain.get(tabId)
  if (cached) {
    startSession(tabId, cached, Date.now(), settingsGetter)
    return
  }
  void resolveDomain(tabId).then((domain) => {
    if (seq !== state.activationSeq) return
    if (!domain) return
    startSession(tabId, domain, Date.now(), settingsGetter)
  })
}

export function handleTabActivated(
  { tabId }: chrome.tabs.OnActivatedInfo,
  settingsGetter: SettingsGetter,
): void {
  const now = Date.now()
  const seq = ++state.activationSeq
  endActiveSession(now, 'tab_activated', settingsGetter)
  resumeSessionFor(tabId, seq, settingsGetter)
}

export function handleTabCreated(tab: chrome.tabs.Tab, settingsGetter: SettingsGetter): void {
  if (tab.id === undefined) return
  const now = Date.now()
  state.tabCreatedAt.set(tab.id, now)
  state.openTabIds.add(tab.id)
  const domain = extractDomain(tab.url)
  if (!domain) return
  state.tabDomain.set(tab.id, domain)
  dispatchEvent(
    {
      timestamp: now,
      domain,
      tabId: tab.id,
      eventType: 'tab_created',
      openTabCount: state.openTabIds.size,
    },
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
  // Sample peak BEFORE shrinking the set so this hour's `peakOpen` still
  // reflects the moment the tab was open.
  const openTabCount = state.openTabIds.size
  state.tabCreatedAt.delete(tabId)
  state.tabDomain.delete(tabId)
  state.openTabIds.delete(tabId)

  // Only record close when we know the domain — 'unknown' would pollute metrics.
  if (!domain) return

  if (createdAt !== undefined) {
    const lifetime = Math.max(0, Math.min(MAX_SESSION_DURATION_MS, now - createdAt))
    dispatchEvent(
      {
        timestamp: now,
        domain,
        tabId,
        eventType: 'tab_closed',
        duration: lifetime,
        openTabCount,
      },
      settingsGetter,
    )
  } else {
    // Tab predates worker boot — record close without duration; avgLifetime
    // untouched (timedCloses guards the denominator).
    dispatchEvent(
      { timestamp: now, domain, tabId, eventType: 'tab_closed', openTabCount },
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
  // `activationSeq` is the supersession token for in-flight async resolutions
  // started by `handleTabActivated` / `handleWindowFocusChanged`. Bumping it
  // here cancels those resolutions — so we must only bump when this update
  // actually changes session state. For SPA URL changes that don't end or
  // restart a session (e.g. YouTube Shorts scrolling on an already-active
  // tab, or any update for a non-active tab), the bump would gratuitously
  // kill a legitimate pending activation for this same domain.
  if (!newDomain) {
    if (state.activeSession?.tabId === tabId) {
      state.activationSeq += 1
      endActiveSession(Date.now(), 'tab_navigated', settingsGetter)
    }
    state.tabDomain.delete(tabId)
    return
  }
  const prevDomain = state.tabDomain.get(tabId)
  if (prevDomain === newDomain) return
  if (state.activeSession?.tabId === tabId) {
    state.activationSeq += 1
    const now = Date.now()
    endActiveSession(now, 'tab_navigated', settingsGetter)
    startSession(tabId, newDomain, now, settingsGetter)
  } else {
    state.tabDomain.set(tabId, newDomain)
  }
}

export function handleWindowFocusChanged(windowId: number, settingsGetter: SettingsGetter): void {
  const now = Date.now()
  const seq = ++state.activationSeq
  endActiveSession(now, 'window_focus', settingsGetter)
  if (windowId === chrome.windows.WINDOW_ID_NONE) return
  chrome.tabs
    .query({ active: true, windowId })
    .then((tabs) => {
      if (seq !== state.activationSeq) return
      const tab = tabs[0]
      if (!tab || tab.id === undefined) return
      resumeSessionFor(tab.id, seq, settingsGetter)
    })
    .catch((err: unknown) => {
      console.warn('[activity] focus query failed', err)
    })
}

/**
 * Prime `tabDomain` and `openTabIds` for tabs that existed before the worker
 * started. `chrome.tabs.query` does not reject when the `tabs` permission is
 * granted (per the manifest), so no try/catch is needed — a failure here
 * would indicate a manifest misconfiguration we want to surface loudly.
 */
export async function primeExistingTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  for (const tab of tabs) {
    if (tab.id === undefined) continue
    state.openTabIds.add(tab.id)
    const domain = extractDomain(tab.url)
    if (domain) state.tabDomain.set(tab.id, domain)
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
