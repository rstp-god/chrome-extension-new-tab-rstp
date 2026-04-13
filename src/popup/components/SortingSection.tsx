import type { GroupSortCriterion, SortScope, TabSortCriterion } from '@/popup/types/rules.ts'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Label } from '@/components/ui/label'
import { SectionCard } from '@/popup/components/SectionCard.tsx'
import { useTabRulesStore } from '@/popup/store/tabRules.ts'
import { GROUP_SORT_CRITERIA, SORT_SCOPES, TAB_SORT_CRITERIA } from '@/popup/types/rules.ts'
import { useTranslation } from 'react-i18next'

export function SortingSection() {
  const { t } = useTranslation('tabRules')
  const sorting = useTabRulesStore((s) => s.sorting)
  const updateSorting = useTabRulesStore((s) => s.updateSorting)

  const disabled = sorting.scope === 'off'

  return (
    <SectionCard title={t('sorting.title')}>
      <ToggleGroup
        type="single"
        value={sorting.scope}
        onValueChange={(v) => v && updateSorting({ scope: v as SortScope })}
        className="w-full rounded-lg border border-border/50 bg-muted/30 p-0.5"
      >
        {SORT_SCOPES.map((s) => (
          <ToggleGroupItem
            key={s.value}
            value={s.value}
            className="flex-1 rounded-md! text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {t(s.labelKey)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className={disabled ? 'pointer-events-none space-y-3 opacity-40' : 'space-y-3'}>
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('sorting.tabSort')}</Label>
          <Select
            value={sorting.tabSort}
            onValueChange={(v) => updateSorting({ tabSort: v as TabSortCriterion })}
          >
            <SelectTrigger className="h-7 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAB_SORT_CRITERIA.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {t(s.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('sorting.groupSort')}</Label>
          <Select
            value={sorting.groupSort}
            onValueChange={(v) => updateSorting({ groupSort: v as GroupSortCriterion })}
          >
            <SelectTrigger className="h-7 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_SORT_CRITERIA.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {t(s.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('sorting.activeTabOnTop')}</Label>
          <Switch
            checked={sorting.activeTabOnTop}
            onCheckedChange={(v) => updateSorting({ activeTabOnTop: v })}
            size="sm"
          />
        </div>
      </div>
    </SectionCard>
  )
}
