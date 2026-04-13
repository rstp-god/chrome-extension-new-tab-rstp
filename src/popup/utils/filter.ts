const SYSTEM_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'devtools://',
  'edge://',
  'about:blank',
]

export function isSystemTab(url: string | undefined): boolean {
  if (!url) return true
  return SYSTEM_PREFIXES.some((prefix) => url.startsWith(prefix))
}

export function isProcessableTab(tab: chrome.tabs.Tab): boolean {
  return !isSystemTab(tab.url) && !tab.pinned
}
