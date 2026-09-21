import { VIKUNJA_PULL_PERIOD_MIN } from '@/background/vikunja/messages.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'

import { VIKUNJA_LOCAL_ONLY_STATUSES } from './constants.ts'
import { VikunjaPullPeriodSelect } from './VikunjaPullPeriodSelect.tsx'

import type { SummaryExtrasProps } from '@/widgets/Todo/integrations/types.ts'

/**
 * What the settings summary shows for Vikunja and for nothing else: how often
 * the service worker pulls in the background, and — in flat mode — which
 * statuses therefore never leave the extension.
 *
 * Both used to be `integration.name === 'vikunja'` branches inside the shared
 * summary. They are here instead because they are facts about this backend:
 * only Vikunja has a worker pulling on a schedule, and only Vikunja has a
 * mode where four of the five statuses are local.
 *
 * Prop-driven, like every component a descriptor points at (see
 * `SummaryExtrasProps`).
 */
export function VikunjaSummaryExtras({ integration, actions }: SummaryExtrasProps) {
  const { t } = useTranslation('todoWidget')

  // The summary renders whatever the active descriptor names, and a mismatch
  // would mean a Vikunja descriptor resolved for another integration's slice.
  if (integration.name !== 'vikunja') return null

  const flatMode = !integration.config.kanbanMapping

  return (
    <>
      <VikunjaPullPeriodSelect
        value={integration.config.pullPeriodMin ?? VIKUNJA_PULL_PERIOD_MIN}
        onChange={(pullPeriodMin) => {
          // The worker keeps no state: it picks the new period up from
          // `chrome.storage.onChanged` on this very write.
          actions.updateIntegrationConfig({ ...integration.config, pullPeriodMin })
        }}
      />

      {flatMode && (
        <div
          data-testid={TestId.TodoSummaryFlatMode}
          className="grid gap-1.5 rounded-2xl border border-border bg-muted/20 px-3 py-2 text-sm"
        >
          <p className="text-muted-foreground">{t('integrations.vikunja.mapping.flatNotice')}</p>
          {/* Named rather than implied: "only Completed syncs" leaves the user
              to work out which statuses that leaves behind. */}
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('integrations.vikunja.summary.localOnlyLabel')}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {VIKUNJA_LOCAL_ONLY_STATUSES.map((status) => (
              <li key={status}>{t(`integrations.mapping.row.${status}`)}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
