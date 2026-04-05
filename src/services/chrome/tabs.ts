import { openUrlInNewTab } from '@/services/chrome/common.ts'
import { getDemoLinkableTabs } from '@/services/chrome/demoProvider.ts'
import { getChromeObject, isShowcaseMode } from '@/services/chrome/runtime.ts'

export interface LinkableTab {
  url: string
  title?: string | null
}

export function canLinkTab(tab?: chrome.tabs.Tab | null): tab is chrome.tabs.Tab & { url: string } {
  return Boolean(tab?.url?.startsWith('http://') || tab?.url?.startsWith('https://'))
}

export async function listLinkableTabs(): Promise<LinkableTab[]> {
  if (isShowcaseMode()) {
    return getDemoLinkableTabs()
  }

  const chromeObject = getChromeObject()
  if (!chromeObject?.tabs?.query) return []

  const tabs = await chromeObject.tabs.query({})
  return tabs
    .filter(canLinkTab)
    .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))
    .map((tab) => ({
      url: tab.url,
      title: tab.title ?? null,
    }))
}

export async function focusOrOpenTab(linkedTab: Pick<LinkableTab, 'url'>) {
  if (isShowcaseMode()) {
    await openUrlInNewTab(linkedTab.url)
    return
  }

  const chromeObject = getChromeObject()
  if (!chromeObject?.tabs?.query || !chromeObject?.tabs?.update || !chromeObject?.windows?.update) {
    await openUrlInNewTab(linkedTab.url)
    return
  }

  const tabs = await chromeObject.tabs.query({})
  const exactMatches = tabs.filter((tab) => tab.url === linkedTab.url)
  const targetTab = exactMatches.find((tab) => tab.active) ?? exactMatches[0]

  if (targetTab?.id) {
    await chromeObject.windows.update(targetTab.windowId, { focused: true })
    await chromeObject.tabs.update(targetTab.id, { active: true })
    return
  }

  await openUrlInNewTab(linkedTab.url)
}
