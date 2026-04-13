export type MatcherType = 'domain' | 'regex' | 'title_contains' | 'path_contains'

export interface Matcher {
  type: MatcherType
  value: string
}

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

export type TabSortCriterion =
  | 'domain_asc'
  | 'title_asc'
  | 'title_desc'
  | 'last_access'
  | 'created'
  | 'url_similarity'

export type GroupSortCriterion = 'name_asc' | 'tab_count' | 'manual'

export type SortScope = 'off' | 'window' | 'global'

export type AutomationMode = 'realtime' | 'debounce' | 'manual'

export type CleanupThreshold = '1d' | '2d' | '4d' | '7d' | '14d' | '28d'
export type CleanupMode = 'ask' | 'auto'

export type UnmatchedTabsBehavior = 'leave_ungrouped' | 'group_other'

export const CLEANUP_THRESHOLD_MS: Record<CleanupThreshold, number> = {
  '1d': 1 * 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  '4d': 4 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '28d': 28 * 24 * 60 * 60 * 1000,
}

export const MATCHER_LABELS: Record<MatcherType, string> = {
  domain: 'DOMAIN',
  regex: 'REGEX',
  title_contains: 'TITLE',
  path_contains: 'PATH',
}

export const AUTOMATION_MODES: { value: AutomationMode; labelKey: string }[] = [
  { value: 'realtime', labelKey: 'settings.realtime' },
  { value: 'debounce', labelKey: 'settings.delayed' },
  { value: 'manual', labelKey: 'settings.manual' },
]

export const CLEANUP_THRESHOLDS: { value: CleanupThreshold; labelKey: string }[] = [
  { value: '1d', labelKey: 'cleanup.threshold.1d' },
  { value: '2d', labelKey: 'cleanup.threshold.2d' },
  { value: '4d', labelKey: 'cleanup.threshold.4d' },
  { value: '7d', labelKey: 'cleanup.threshold.7d' },
  { value: '14d', labelKey: 'cleanup.threshold.14d' },
  { value: '28d', labelKey: 'cleanup.threshold.28d' },
]

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

export const EXAMPLE_RULES: GroupingRule[] = [
  {
    id: 'example-1',
    enabled: true,
    matcher: { type: 'domain', value: 'github.com' },
    group: { name: 'Code', color: 'green' },
  },
  {
    id: 'example-2',
    enabled: true,
    matcher: { type: 'domain', value: '*.google.com' },
    group: { name: 'Google', color: 'blue' },
  },
  {
    id: 'example-3',
    enabled: true,
    matcher: { type: 'title_contains', value: 'YouTube' },
    group: { name: 'Media', color: 'red' },
  },
]

export const DEFAULT_TAB_RULES_SETTINGS: TabRulesSettings = {
  enabled: false,
  rules: [],
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
