import type { Synced } from '@/services/chrome/zustandChromeSync.ts'
import { withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import { tabRulesEnvelopeSchema } from '@/popup/services/schema.ts'
import type {
  AutomationMode,
  ChromeGroupColor,
  CleanupMode,
  CleanupThreshold,
  GroupingRule,
  GroupSortCriterion,
  SortScope,
  TabRulesSettings,
  TabSortCriterion,
  UnmatchedTabsBehavior,
} from '@/popup/types/rules.ts'
import {
  DEFAULT_TAB_RULES_SETTINGS,
  TAB_RULES_KEY,
} from '@/popup/types/rules.ts'
import { create } from 'zustand/react'

interface TabRulesActions {
  toggleEnabled: () => void

  addRule: (rule: Omit<GroupingRule, 'id'>) => void
  updateRule: (id: string, patch: Partial<Omit<GroupingRule, 'id'>>) => void
  deleteRule: (id: string) => void
  reorderRules: (orderedIds: string[]) => void
  toggleRule: (id: string) => void

  updateSorting: (patch: Partial<TabRulesSettings['sorting']>) => void
  updateAutomation: (patch: Partial<TabRulesSettings['automation']>) => void
  updateCleanup: (patch: Partial<TabRulesSettings['cleanup']>) => void
  updateUnmatchedTabs: (patch: Partial<TabRulesSettings['unmatchedTabs']>) => void
}

type TabRulesStore = TabRulesSettings & TabRulesActions

export const useTabRulesStore = create<Synced<TabRulesStore>>()(
  withChromeSync<TabRulesStore, TabRulesSettings>({
    key: TAB_RULES_KEY,
    schema: tabRulesEnvelopeSchema,
    autoPersist: true,
    partialize: (s) => ({
      enabled: s.enabled,
      rules: s.rules,
      sorting: s.sorting,
      automation: s.automation,
      cleanup: s.cleanup,
      unmatchedTabs: s.unmatchedTabs,
    }),
    merge: (_cur, incoming) => incoming,
  })((setState, getState) => ({
    ...DEFAULT_TAB_RULES_SETTINGS,

    toggleEnabled: () => setState({ enabled: !getState().enabled }),

    addRule: (rule) => {
      const newRule: GroupingRule = { ...rule, id: crypto.randomUUID() }
      setState({ rules: [...getState().rules, newRule] })
    },

    updateRule: (id, patch) =>
      setState({
        rules: getState().rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }),

    deleteRule: (id) =>
      setState({ rules: getState().rules.filter((r) => r.id !== id) }),

    reorderRules: (orderedIds) => {
      const rulesMap = new Map(getState().rules.map((r) => [r.id, r]))
      const reordered = orderedIds.map((id) => rulesMap.get(id)).filter(Boolean) as GroupingRule[]
      setState({ rules: reordered })
    },

    toggleRule: (id) =>
      setState({
        rules: getState().rules.map((r) =>
          r.id === id ? { ...r, enabled: !r.enabled } : r,
        ),
      }),

    updateSorting: (patch) =>
      setState({ sorting: { ...getState().sorting, ...patch } }),

    updateAutomation: (patch) =>
      setState({ automation: { ...getState().automation, ...patch } }),

    updateCleanup: (patch) =>
      setState({ cleanup: { ...getState().cleanup, ...patch } }),

    updateUnmatchedTabs: (patch) =>
      setState({ unmatchedTabs: { ...getState().unmatchedTabs, ...patch } }),
  })),
)

export type {
  AutomationMode,
  ChromeGroupColor,
  CleanupMode,
  CleanupThreshold,
  GroupingRule,
  GroupSortCriterion,
  SortScope,
  TabRulesSettings,
  TabSortCriterion,
  UnmatchedTabsBehavior,
}
