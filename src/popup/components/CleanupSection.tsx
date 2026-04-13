import type { CleanupMode, CleanupThreshold } from '@/popup/types/rules.ts'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SectionCard } from '@/popup/components/SectionCard.tsx'
import { useTabRulesStore } from '@/popup/store/tabRules.ts'
import { CLEANUP_THRESHOLDS } from '@/popup/types/rules.ts'
import { useTranslation } from 'react-i18next'

export function CleanupSection() {
  const { t } = useTranslation('tabRules')
  const cleanup = useTabRulesStore((s) => s.cleanup)
  const updateCleanup = useTabRulesStore((s) => s.updateCleanup)

  const disabled = !cleanup.enabled

  return (
    <SectionCard
      title={t('cleanup.title')}
      toggle={{
        checked: cleanup.enabled,
        onCheckedChange: (v) => updateCleanup({ enabled: v }),
      }}
    >
      <div className={disabled ? 'pointer-events-none space-y-2 opacity-40' : 'space-y-2'}>
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('cleanup.closeAfter')}</Label>
          <Select
            value={cleanup.threshold}
            onValueChange={(v) => updateCleanup({ threshold: v as CleanupThreshold })}
          >
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLEANUP_THRESHOLDS.map((th) => (
                <SelectItem key={th.value} value={th.value}>
                  {t(th.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <RadioGroup
          value={cleanup.mode}
          onValueChange={(v) => updateCleanup({ mode: v as CleanupMode })}
          className="space-y-1"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="ask" id="cleanup-ask" />
            <Label htmlFor="cleanup-ask" className="text-xs font-normal">
              {t('cleanup.askMode')}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="auto" id="cleanup-auto" />
            <Label htmlFor="cleanup-auto" className="text-xs font-normal">
              {t('cleanup.autoMode')}
            </Label>
          </div>
        </RadioGroup>
      </div>
    </SectionCard>
  )
}
