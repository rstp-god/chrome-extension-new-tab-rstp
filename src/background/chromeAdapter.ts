import type { ChromeGroupColor } from '@/popup/types/rules.ts'

export async function getAllTabs(): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({})
}

export async function getWindowTabs(windowId: number): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({ windowId })
}

export async function createOrUpdateGroup(
  windowId: number,
  name: string,
  color: ChromeGroupColor,
  tabIds: number[],
): Promise<number> {
  if (tabIds.length === 0) return -1

  const ids = tabIds as [number, ...number[]]
  const existingGroups = await chrome.tabGroups.query({ windowId, title: name })
  let groupId: number

  if (existingGroups.length > 0) {
    groupId = existingGroups[0].id
    await chrome.tabs.group({ tabIds: ids, groupId })
  } else {
    groupId = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId } })
  }

  await chrome.tabGroups.update(groupId, { title: name, color })
  return groupId
}

export async function ungroupTab(tabId: number): Promise<void> {
  await chrome.tabs.ungroup(tabId)
}

export async function ungroupAll(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  const groupedTabs = tabs.filter((t) => t.groupId !== -1 && t.id !== undefined)
  await Promise.all(groupedTabs.map((t) => ungroupTab(t.id!)))
}

export async function moveTab(tabId: number, index: number): Promise<void> {
  await chrome.tabs.move(tabId, { index })
}
