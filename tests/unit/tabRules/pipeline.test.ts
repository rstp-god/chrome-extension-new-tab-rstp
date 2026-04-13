import type { TabRulesSettings } from '@/popup/types/rules.ts'
import { DEFAULT_TAB_RULES_SETTINGS } from '@/popup/types/rules.ts'
import { executePipeline } from '@/popup/services/pipeline.ts'
import { describe, expect, it } from 'vitest'

function makeTab(id: number, url: string, title = '', pinned = false): chrome.tabs.Tab {
  return {
    id,
    index: 0,
    pinned,
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

describe('executePipeline', () => {
  const tabs = [
    makeTab(1, 'https://github.com/repo1', 'GitHub - Repo 1'),
    makeTab(2, 'https://github.com/repo2', 'GitHub - Repo 2'),
    makeTab(3, 'https://docs.google.com/doc', 'Google Docs'),
    makeTab(4, 'https://mail.google.com/inbox', 'Gmail'),
    makeTab(5, 'https://youtube.com', 'YouTube - Home'),
    makeTab(6, 'https://stackoverflow.com', 'Stack Overflow'),
    makeTab(7, 'chrome://settings', 'Settings'),
    makeTab(8, 'https://reddit.com', 'Reddit', true), // pinned
  ]

  it('filters system and pinned tabs, groups the rest', () => {
    const result = executePipeline(tabs, DEFAULT_TAB_RULES_SETTINGS)

    // System tab (7) and pinned tab (8) should be excluded
    const allTabIds = [
      ...result.groups.flatMap((g) => g.tabIds),
      ...result.ungroupedTabIds,
    ]
    expect(allTabIds).not.toContain(7)
    expect(allTabIds).not.toContain(8)
  })

  it('creates groups based on default rules', () => {
    const result = executePipeline(tabs, DEFAULT_TAB_RULES_SETTINGS)

    const codeGroup = result.groups.find((g) => g.name === 'Code')
    expect(codeGroup?.tabIds).toEqual(expect.arrayContaining([1, 2]))
    expect(codeGroup?.color).toBe('green')

    const googleGroup = result.groups.find((g) => g.name === 'Google')
    expect(googleGroup?.tabIds).toEqual(expect.arrayContaining([3, 4]))
    expect(googleGroup?.color).toBe('blue')

    const mediaGroup = result.groups.find((g) => g.name === 'Media')
    expect(mediaGroup?.tabIds).toEqual(expect.arrayContaining([5]))
  })

  it('puts unmatched tabs in ungroupedTabIds when leave_ungrouped', () => {
    const settings: TabRulesSettings = {
      ...DEFAULT_TAB_RULES_SETTINGS,
      unmatchedTabs: { behavior: 'leave_ungrouped', otherGroupColor: 'grey' },
    }
    const result = executePipeline(tabs, settings)
    expect(result.ungroupedTabIds).toContain(6)
  })

  it('groups unmatched into "Other" when group_other', () => {
    const settings: TabRulesSettings = {
      ...DEFAULT_TAB_RULES_SETTINGS,
      unmatchedTabs: { behavior: 'group_other', otherGroupColor: 'cyan' },
    }
    const result = executePipeline(tabs, settings)
    const otherGroup = result.groups.find((g) => g.name === 'Other')
    expect(otherGroup?.tabIds).toContain(6)
    expect(otherGroup?.color).toBe('cyan')
  })

  it('returns empty result for empty tabs', () => {
    const result = executePipeline([], DEFAULT_TAB_RULES_SETTINGS)
    expect(result.groups).toHaveLength(0)
    expect(result.ungroupedTabIds).toHaveLength(0)
  })

  it('skips sorting when scope is off', () => {
    const settings: TabRulesSettings = {
      ...DEFAULT_TAB_RULES_SETTINGS,
      sorting: { ...DEFAULT_TAB_RULES_SETTINGS.sorting, scope: 'off' },
    }
    const result = executePipeline(tabs, settings)
    // Should still group, just not sort
    expect(result.groups.length).toBeGreaterThan(0)
  })
})
