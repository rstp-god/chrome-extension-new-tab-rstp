export interface LinkableTab {
  url: string
  title?: string | null
}

export function canLinkTab(tab?: chrome.tabs.Tab | null): tab is chrome.tabs.Tab & { url: string } {
  return Boolean(tab?.url?.startsWith('http://') || tab?.url?.startsWith('https://'))
}

export async function listLinkableTabs() {
  const tabs = await chrome.tabs.query({})
  return tabs
    .filter(canLinkTab)
    .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))
}

export async function getPreferredAttachableTab() {
  const attachableTabs = await listLinkableTabs()

  if (attachableTabs.length === 0) return

  const activeTab = [...attachableTabs]
    .filter((tab) => tab.active)
    .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0]
  if (activeTab) return activeTab

  return [...attachableTabs].sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0]
}

export async function focusOrOpenTab(linkedTab: Pick<LinkableTab, 'url'>) {
  const tabs = await chrome.tabs.query({})
  const exactMatches = tabs.filter((tab) => tab.url === linkedTab.url)
  const targetTab = exactMatches.find((tab) => tab.active) ?? exactMatches[0]

  if (targetTab?.id && typeof targetTab.windowId === 'number') {
    await chrome.windows.update(targetTab.windowId, { focused: true })
    await chrome.tabs.update(targetTab.id, { active: true })
    return
  }

  await chrome.tabs.create({ url: linkedTab.url })
}
