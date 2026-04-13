import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import { z } from 'zod'

const matcherTypeSchema = z.enum(['domain', 'regex', 'title_contains', 'path_contains'])

const matcherSchema = z.object({
  type: matcherTypeSchema,
  value: z.string(),
})

const chromeGroupColorSchema = z.enum([
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
])

const groupingRuleSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  matcher: matcherSchema,
  group: z.object({
    name: z.string(),
    color: chromeGroupColorSchema,
  }),
})

const tabSortCriterionSchema = z.enum([
  'domain_asc',
  'title_asc',
  'title_desc',
  'last_access',
  'created',
  'url_similarity',
])

const groupSortCriterionSchema = z.enum(['name_asc', 'tab_count', 'manual'])

const sortScopeSchema = z.enum(['off', 'window', 'global'])

const automationModeSchema = z.enum(['realtime', 'debounce', 'manual'])

const cleanupThresholdSchema = z.enum(['1d', '2d', '4d', '7d', '14d', '28d'])

const cleanupModeSchema = z.enum(['ask', 'auto'])

const unmatchedTabsBehaviorSchema = z.enum(['leave_ungrouped', 'group_other'])

export const tabRulesSettingsSchema = z.object({
  enabled: z.boolean(),
  rules: z.array(groupingRuleSchema),
  sorting: z.object({
    scope: sortScopeSchema,
    tabSort: tabSortCriterionSchema,
    groupSort: groupSortCriterionSchema,
    activeTabOnTop: z.boolean(),
  }),
  automation: z.object({
    mode: automationModeSchema,
    debounceMs: z.number().min(0),
  }),
  cleanup: z.object({
    enabled: z.boolean(),
    threshold: cleanupThresholdSchema,
    mode: cleanupModeSchema,
  }),
  unmatchedTabs: z.object({
    behavior: unmatchedTabsBehaviorSchema,
    otherGroupColor: chromeGroupColorSchema,
  }),
})

export const tabRulesEnvelopeSchema = makeEnvelopeSchema(tabRulesSettingsSchema)
