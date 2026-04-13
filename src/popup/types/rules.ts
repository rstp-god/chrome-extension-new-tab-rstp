// Matcher types (spec §3.2)
export type MatcherType = 'domain' | 'regex' | 'title_contains' | 'path_contains'

export interface Matcher {
  type: MatcherType
  value: string
}

// Chrome Tab Group colors (spec §2.3)
export type ChromeGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'

export interface GroupingRule {
  id: string
  enabled: boolean
  matcher: Matcher
  group: {
    name: string
    color: ChromeGroupColor
  }
}

// Sort criteria (spec §4.2, §4.3)
export type TabSortCriterion =
  | 'domain_asc'
  | 'title_asc'
  | 'title_desc'
  | 'last_access'
  | 'created'
  | 'url_similarity'

export type GroupSortCriterion = 'name_asc' | 'tab_count' | 'manual'

export type SortScope = 'off' | 'window' | 'global'

// Automation (spec §5.1)
export type AutomationMode = 'realtime' | 'debounce' | 'manual'

// Cleanup (spec §9.2)
export type CleanupThreshold = '1d' | '2d' | '4d' | '7d' | '14d' | '28d'
export type CleanupMode = 'ask' | 'auto'

// Unmatched tabs (spec §3.5)
export type UnmatchedTabsBehavior = 'leave_ungrouped' | 'group_other'

// Full settings state
export interface TabRulesSettings {
  enabled: boolean
  rules: GroupingRule[]
  sorting: {
    scope: SortScope
    tabSort: TabSortCriterion
    groupSort: GroupSortCriterion
    activeTabOnTop: boolean
  }
  automation: {
    mode: AutomationMode
    debounceMs: number
  }
  cleanup: {
    enabled: boolean
    threshold: CleanupThreshold
    mode: CleanupMode
  }
  unmatchedTabs: {
    behavior: UnmatchedTabsBehavior
    otherGroupColor: ChromeGroupColor
  }
}

export const TAB_RULES_KEY = 'tabRules:v1'

export const DEFAULT_RULES: GroupingRule[] = [
  {
    id: 'default-1',
    enabled: true,
    matcher: { type: 'domain', value: 'github.com' },
    group: { name: 'Code', color: 'green' },
  },
  {
    id: 'default-2',
    enabled: true,
    matcher: { type: 'domain', value: '*.google.com' },
    group: { name: 'Google', color: 'blue' },
  },
  {
    id: 'default-3',
    enabled: true,
    matcher: { type: 'title_contains', value: 'YouTube' },
    group: { name: 'Media', color: 'red' },
  },
]

export const DEFAULT_TAB_RULES_SETTINGS: TabRulesSettings = {
  enabled: true,
  rules: DEFAULT_RULES,
  sorting: {
    scope: 'global',
    tabSort: 'domain_asc',
    groupSort: 'name_asc',
    activeTabOnTop: true,
  },
  automation: {
    mode: 'realtime',
    debounceMs: 3000,
  },
  cleanup: {
    enabled: false,
    threshold: '7d',
    mode: 'ask',
  },
  unmatchedTabs: {
    behavior: 'leave_ungrouped',
    otherGroupColor: 'grey',
  },
}
