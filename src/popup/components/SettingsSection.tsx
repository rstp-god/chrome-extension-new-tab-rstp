import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ColorPicker } from '@/popup/components/ColorPicker.tsx'
import { SectionCard } from '@/popup/components/SectionCard.tsx'
import { useTabRulesStore } from '@/popup/store/tabRules.ts'
import type { AutomationMode, UnmatchedTabsBehavior } from '@/popup/types/rules.ts'
import { AUTOMATION_MODES } from '@/popup/types/rules.ts'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

export function SettingsSection() {
  const { t } = useTranslation('tabRules')
  const { automation, updateAutomation, unmatchedTabs, updateUnmatchedTabs } = useTabRulesStore(
    useShallow((s) => ({
      automation: s.automation,
      updateAutomation: s.updateAutomation,
      unmatchedTabs: s.unmatchedTabs,
      updateUnmatchedTabs: s.updateUnmatchedTabs,
    })),
  )

  return (
    <SectionCard title={t('settings.title')}>
      <div className="space-y-1.5">
        <Label className="text-xs">{t('settings.automationMode')}</Label>
        <ToggleGroup
          type="single"
          value={automation.mode}
          onValueChange={(v: string) => {
            if (v) updateAutomation({ mode: v as AutomationMode })
          }}
          className="w-full rounded-lg border border-border/50 bg-muted/30 p-0.5"
        >
          {AUTOMATION_MODES.map((m) => (
            <ToggleGroupItem
              key={m.value}
              value={m.value}
              className="flex-1 rounded-md! text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {t(m.labelKey)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {automation.mode === 'debounce' && (
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('settings.delaySeconds')}</Label>
          <Input
            type="number"
            min={1}
            max={30}
            className="h-7 w-[70px] text-xs"
            value={automation.debounceMs / 1000}
            onChange={(e) => updateAutomation({ debounceMs: Number(e.target.value) * 1000 })}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">{t('settings.unmatchedTabs')}</Label>
        <Select
          value={unmatchedTabs.behavior}
          onValueChange={(v) => updateUnmatchedTabs({ behavior: v as UnmatchedTabsBehavior })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="leave_ungrouped">{t('settings.unmatchedTabs.leave')}</SelectItem>
            <SelectItem value="group_other">{t('settings.unmatchedTabs.group')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {unmatchedTabs.behavior === 'group_other' && (
        <ColorPicker
          value={unmatchedTabs.otherGroupColor}
          onChange={(color) => updateUnmatchedTabs({ otherGroupColor: color })}
        />
      )}
    </SectionCard>
  )
}
