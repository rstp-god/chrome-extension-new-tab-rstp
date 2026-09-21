import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label.tsx'
import { Switch } from '@/components/ui/switch.tsx'

import type { MappingProblems } from './autoMapping.ts'

interface Props {
  problems: MappingProblems
  confirmCompleted: boolean
  onConfirmCompleted: (confirmed: boolean) => void
}

/**
 * What is wrong with the current draft.
 *
 * Two of the three block the save outright; the third — `completed` not
 * pointing at the done bucket — is a choice the user is allowed to make, so
 * it comes with the switch that unblocks it rather than with a refusal.
 *
 * Empty rows are not reported here: they are obvious from the rows
 * themselves, and the "create the missing columns" panel is the answer to
 * them.
 */
export function VikunjaMappingProblems({ problems, confirmCompleted, onConfirmCompleted }: Props) {
  const { t } = useTranslation('todoWidget')

  return (
    <>
      {problems.conflicts.length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          {t('integrations.vikunja.mapping.conflict')}
        </p>
      )}

      {problems.terminalMisused.length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          {t('integrations.vikunja.mapping.terminalMisused', {
            statuses: problems.terminalMisused
              .map((status) => t(`integrations.mapping.row.${status}`))
              .join(', '),
          })}
        </p>
      )}

      {problems.completedNotTerminal && (
        <div
          role="alert"
          className="grid gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-500"
        >
          <span>{t('integrations.vikunja.mapping.completedNotTerminal')}</span>
          <Label className="gap-2">
            <Switch checked={confirmCompleted} onCheckedChange={onConfirmCompleted} />
            <span>{t('integrations.vikunja.mapping.confirmCompleted')}</span>
          </Label>
        </div>
      )}
    </>
  )
}
