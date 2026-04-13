import type { GroupSortCriterion, TabSortCriterion } from '@/popup/types/rules.ts'
import type { TabGroup } from '@/popup/services/grouping.ts'

function getDomain(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function getPathPrefix(url?: string): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.hostname + u.pathname
  } catch {
    return ''
  }
}

export function sortTabsInGroup(
  tabs: chrome.tabs.Tab[],
  criterion: TabSortCriterion,
): chrome.tabs.Tab[] {
  const sorted = [...tabs]

  switch (criterion) {
    case 'domain_asc':
      sorted.sort((a, b) => getDomain(a.url).localeCompare(getDomain(b.url)))
      break
    case 'title_asc':
      sorted.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
      break
    case 'title_desc':
      sorted.sort((a, b) => (b.title ?? '').localeCompare(a.title ?? ''))
      break
    case 'last_access':
      sorted.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
      break
    case 'created':
      sorted.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
      break
    case 'url_similarity':
      sorted.sort((a, b) =>
        getPathPrefix(a.url).localeCompare(getPathPrefix(b.url)),
      )
      break
  }

  return sorted
}

export function sortGroups(
  groups: Map<string, TabGroup>,
  criterion: GroupSortCriterion,
): Map<string, TabGroup> {
  const entries = [...groups.entries()]

  switch (criterion) {
    case 'name_asc':
      entries.sort(([, a], [, b]) => a.name.localeCompare(b.name))
      break
    case 'tab_count':
      entries.sort(([, a], [, b]) => b.tabs.length - a.tabs.length)
      break
    case 'manual':
      break
  }

  return new Map(entries)
}

export function applyActiveTabOnTop(
  tabs: chrome.tabs.Tab[],
  activeTabId: number | undefined,
): chrome.tabs.Tab[] {
  if (activeTabId === undefined) return tabs

  const idx = tabs.findIndex((t) => t.id === activeTabId)
  if (idx <= 0) return tabs

  const result = [...tabs]
  const [active] = result.splice(idx, 1)
  result.unshift(active)
  return result
}
