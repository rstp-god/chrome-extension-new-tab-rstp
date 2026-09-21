import { VIKUNJA_PULL_PERIODS_MIN } from '@/background/vikunja/messages.ts'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { useTranslation } from 'react-i18next'

import type { VikunjaPullPeriod } from '@/background/vikunja/messages.ts'

interface Props {
  value: VikunjaPullPeriod
  disabled?: boolean
  onChange: (periodMin: VikunjaPullPeriod) => void
}

/**
 * How often the service worker pulls the view in the background.
 *
 * Prop-driven like every other component a descriptor owns: it never reads
 * the store, because the store imports the integration registry and an import
 * back would close the loop `store → registry → descriptor → component →
 * store`. The settings layer holds the config and the write action already.
 *
 * The options come from the shared `VIKUNJA_PULL_PERIODS_MIN`, which is also
 * what the worker validates a stored period against — so the picker cannot
 * offer a value the background pull would then refuse.
 */
export function VikunjaPullPeriodSelect({ value, disabled, onChange }: Props) {
  const { t } = useTranslation('todoWidget')

  return (
    <Field>
      <FieldLabel htmlFor="vikunja-pull-period">
        {t('integrations.vikunja.summary.pullPeriodLabel')}
      </FieldLabel>
      <Select
        value={String(value)}
        disabled={disabled}
        onValueChange={(next) => {
          // A `Select` speaks strings; only one of the three offered values can
          // come back, and anything else is ignored rather than persisted.
          const parsed = VIKUNJA_PULL_PERIODS_MIN.find((period) => String(period) === next)
          if (parsed !== undefined) onChange(parsed)
        }}
      >
        <SelectTrigger id="vikunja-pull-period" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIKUNJA_PULL_PERIODS_MIN.map((period) => (
            <SelectItem key={period} value={String(period)}>
              {t('integrations.vikunja.summary.pullPeriodOption', { minutes: period })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {t('integrations.vikunja.summary.pullPeriodHint')}
      </p>
    </Field>
  )
}
