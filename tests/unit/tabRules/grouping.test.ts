import type { GroupingRule } from '@/popup/types/rules.ts'
import { getUngroupedTabs, groupTabs } from '@/popup/services/grouping.ts'
import { describe, expect, it } from 'vitest'

function makeRule(overrides: Partial<GroupingRule> = {}): GroupingRule {
  return {
    id: 'r1',
    enabled: true,
    matcher: { type: 'domain', value: 'github.com' },
    group: { name: 'Code', color: 'green' },
    ...overrides,
  }
}

function makeTab(id: number, url: string, title = ''): chrome.tabs.Tab {
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
  }
}

describe('groupTabs', () => {
  const rules: GroupingRule[] = [
    makeRule({ id: 'r1', matcher: { type: 'domain', value: 'github.com' }, group: { name: 'Code', color: 'green' } }),
    makeRule({ id: 'r2', matcher: { type: 'domain', value: '*.google.com' }, group: { name: 'Google', color: 'blue' } }),
    makeRule({ id: 'r3', matcher: { type: 'title_contains', value: 'YouTube' }, group: { name: 'Media', color: 'red' } }),
  ]

  const tabs = [
    makeTab(1, 'https://github.com/repo1'),
    makeTab(2, 'https://github.com/repo2'),
    makeTab(3, 'https://docs.google.com/doc/1'),
    makeTab(4, 'https://mail.google.com/inbox'),
    makeTab(5, 'https://youtube.com', 'YouTube - Home'),
    makeTab(6, 'https://stackoverflow.com/q/123'),
    makeTab(7, 'https://reddit.com/r/programming'),
  ]

  it('distributes tabs into groups by rules', () => {
    const groups = groupTabs(tabs, rules, 'leave_ungrouped')
    expect(groups.get('Code')?.tabs).toHaveLength(2)
    expect(groups.get('Google')?.tabs).toHaveLength(2)
    expect(groups.get('Media')?.tabs).toHaveLength(1)
    expect(groups.has('Other')).toBe(false)
  })

  it('groups unmatched into "Other" when configured', () => {
    const groups = groupTabs(tabs, rules, 'group_other', 'grey')
    expect(groups.get('Other')?.tabs).toHaveLength(2)
    expect(groups.get('Other')?.color).toBe('grey')
  })

  it('leaves unmatched ungrouped by default', () => {
    const groups = groupTabs(tabs, rules, 'leave_ungrouped')
    const groupedIds = new Set<number>()
    for (const [, g] of groups) {
      g.tabs.forEach((t) => groupedIds.add(t.id!))
    }
    expect(groupedIds.has(6)).toBe(false)
    expect(groupedIds.has(7)).toBe(false)
  })

  it('handles empty rules — no groups created', () => {
    const groups = groupTabs(tabs, [], 'leave_ungrouped')
    expect(groups.size).toBe(0)
  })

  it('handles empty tabs', () => {
    const groups = groupTabs([], rules, 'leave_ungrouped')
    expect(groups.size).toBe(0)
  })
})

describe('getUngroupedTabs', () => {
  it('returns tabs that match no rules', () => {
    const rules = [makeRule({ matcher: { type: 'domain', value: 'github.com' } })]
    const tabs = [
      makeTab(1, 'https://github.com/repo'),
      makeTab(2, 'https://stackoverflow.com'),
    ]
    const ungrouped = getUngroupedTabs(tabs, rules)
    expect(ungrouped).toHaveLength(1)
    expect(ungrouped[0].id).toBe(2)
  })
})
