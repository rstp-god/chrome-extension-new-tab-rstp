import type { TabGroup } from '@/popup/services/grouping.ts'
import { applyActiveTabOnTop, sortGroups, sortTabsInGroup } from '@/popup/services/sorting.ts'
import { describe, expect, it } from 'vitest'

function makeTab(id: number, url: string, title = '', lastAccessed = 0): chrome.tabs.Tab {
  return {
    id,
    index: 0,
    pinned: false,
    highlighted: false,
    windowId: 1,
    active: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    groupId: -1,
    url,
    title,
    lastAccessed,
  }
}

describe('sortTabsInGroup', () => {
  const tabs = [
    makeTab(1, 'https://github.com/b', 'Beta', 100),
    makeTab(2, 'https://alpha.com/a', 'Alpha', 300),
    makeTab(3, 'https://github.com/a', 'Gamma', 200),
  ]

  it('sorts by domain ascending', () => {
    const sorted = sortTabsInGroup(tabs, 'domain_asc')
    expect(sorted.map((t) => t.id)).toEqual([2, 1, 3])
  })

  it('sorts by title ascending', () => {
    const sorted = sortTabsInGroup(tabs, 'title_asc')
    expect(sorted.map((t) => t.id)).toEqual([2, 1, 3])
  })

  it('sorts by title descending', () => {
    const sorted = sortTabsInGroup(tabs, 'title_desc')
    expect(sorted.map((t) => t.id)).toEqual([3, 1, 2])
  })

  it('sorts by last access (most recent first)', () => {
    const sorted = sortTabsInGroup(tabs, 'last_access')
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1])
  })

  it('does not mutate original array', () => {
    const original = [...tabs]
    sortTabsInGroup(tabs, 'title_asc')
    expect(tabs).toEqual(original)
  })
})

describe('sortGroups', () => {
  function makeGroup(name: string, tabCount: number): TabGroup {
    return {
      name,
      color: 'grey',
      tabs: Array.from({ length: tabCount }, (_, i) => makeTab(i, `https://example.com/${i}`)),
    }
  }

  it('sorts by name ascending', () => {
    const groups = new Map<string, TabGroup>([
      ['Code', makeGroup('Code', 3)],
      ['Alpha', makeGroup('Alpha', 1)],
      ['Beta', makeGroup('Beta', 2)],
    ])
    const sorted = sortGroups(groups, 'name_asc')
    expect([...sorted.keys()]).toEqual(['Alpha', 'Beta', 'Code'])
  })

  it('sorts by tab count descending', () => {
    const groups = new Map<string, TabGroup>([
      ['Small', makeGroup('Small', 1)],
      ['Big', makeGroup('Big', 5)],
      ['Medium', makeGroup('Medium', 3)],
    ])
    const sorted = sortGroups(groups, 'tab_count')
    expect([...sorted.keys()]).toEqual(['Big', 'Medium', 'Small'])
  })

  it('preserves order for manual', () => {
    const groups = new Map<string, TabGroup>([
      ['C', makeGroup('C', 1)],
      ['A', makeGroup('A', 1)],
      ['B', makeGroup('B', 1)],
    ])
    const sorted = sortGroups(groups, 'manual')
    expect([...sorted.keys()]).toEqual(['C', 'A', 'B'])
  })
})

describe('applyActiveTabOnTop', () => {
  const tabs = [
    makeTab(1, 'https://a.com'),
    makeTab(2, 'https://b.com'),
    makeTab(3, 'https://c.com'),
  ]

  it('moves active tab to the top', () => {
    const result = applyActiveTabOnTop(tabs, 3)
    expect(result.map((t) => t.id)).toEqual([3, 1, 2])
  })

  it('returns unchanged if active tab is already first', () => {
    const result = applyActiveTabOnTop(tabs, 1)
    expect(result.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('returns unchanged if active tab not found', () => {
    const result = applyActiveTabOnTop(tabs, 999)
    expect(result.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('returns unchanged if activeTabId is undefined', () => {
    const result = applyActiveTabOnTop(tabs, undefined)
    expect(result.map((t) => t.id)).toEqual([1, 2, 3])
  })
})
