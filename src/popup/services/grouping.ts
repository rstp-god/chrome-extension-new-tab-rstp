import type { ChromeGroupColor, GroupingRule, UnmatchedTabsBehavior } from '@/popup/types/rules.ts'
import { findMatchingRule } from '@/popup/services/matchers.ts'

export interface TabGroup {
  name: string
  color: ChromeGroupColor
  tabs: chrome.tabs.Tab[]
}

export function groupTabs(
  tabs: chrome.tabs.Tab[],
  rules: GroupingRule[],
  unmatchedBehavior: UnmatchedTabsBehavior,
  otherGroupColor: ChromeGroupColor = 'grey',
): Map<string, TabGroup> {
  const groups = new Map<string, TabGroup>()
  const ungrouped: chrome.tabs.Tab[] = []

  for (const tab of tabs) {
    const rule = findMatchingRule(tab, rules)
    if (rule) {
      const key = rule.group.name
      const existing = groups.get(key)
      if (existing) {
        existing.tabs.push(tab)
      } else {
        groups.set(key, {
          name: rule.group.name,
          color: rule.group.color,
          tabs: [tab],
        })
      }
    } else {
      ungrouped.push(tab)
    }
  }

  if (unmatchedBehavior === 'group_other' && ungrouped.length > 0) {
    groups.set('Other', {
      name: 'Other',
      color: otherGroupColor,
      tabs: ungrouped,
    })
  }

  return groups
}

export function getUngroupedTabs(
  tabs: chrome.tabs.Tab[],
  rules: GroupingRule[],
): chrome.tabs.Tab[] {
  return tabs.filter((tab) => findMatchingRule(tab, rules) === null)
}
