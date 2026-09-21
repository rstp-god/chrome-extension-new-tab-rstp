import { StarIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { VIKUNJA_PULL_PERIOD_MIN } from '@/background/vikunja/messages.ts'
import { Button } from '@/components/ui/button.tsx'
import { TestId } from '@tests/constants/testIds.ts'

import { defaultBoard } from './boards.ts'
import { VIKUNJA_LOCAL_ONLY_STATUSES } from './constants.ts'
import { VikunjaPullPeriodSelect } from './VikunjaPullPeriodSelect.tsx'

import type { SummaryExtrasProps } from '@/widgets/Todo/integrations/types.ts'

/**
 * What the settings summary shows for Vikunja and for nothing else: the
 * boards it syncs, how often the service worker pulls them in the background,
 * and — for a board in flat mode — which statuses therefore never leave the
 * extension.
 *
 * The last two used to be `integration.name === 'vikunja'` branches inside
 * the shared summary. They are here instead because they are facts about this
 * backend: only Vikunja has a worker pulling on a schedule, and only Vikunja
 * has a mode where four of the five statuses are local.
 *
 * The boards are here for a different reason: the shared summary's own
 * "Board" line reads the slice, which this backend no longer keeps — and a
 * connection that syncs several boards has no single name to put there. Each
 * board carries its own columns, so each gets its own way back into the
 * wizard.
 *
 * Prop-driven, like every component a descriptor points at (see
 * `SummaryExtrasProps`).
 */
export function VikunjaSummaryExtras({
  integration,
  onEditMapping,
  onPickScope,
  actions,
}: SummaryExtrasProps) {
  const { t } = useTranslation('todoWidget')
  const summaryKey = (leaf: string) => `integrations.vikunja.summary.${leaf}`

  // The summary renders whatever the active descriptor names, and a mismatch
  // would mean a Vikunja descriptor resolved for another integration's slice.
  if (integration.name !== 'vikunja') return null

  const boards = integration.config.boards
  const defaultProjectId = defaultBoard(integration.config)?.projectId ?? null
  // One notice for the connection rather than one per board: the sentence is
  // about what the extension keeps to itself, which is the same wherever a
  // flat board is in the list — the badges above say which boards those are.
  const anyFlat = boards.some((board) => !board.kanbanMapping)

  return (
    <>
      <div className="grid gap-1.5 rounded-2xl border border-border bg-muted/20 p-3 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t(summaryKey('boards'))}
        </div>

        <ul data-testid={TestId.TodoSummaryBoard} className="grid gap-1">
          {boards.map((board) => (
            <li key={board.projectId} className="flex items-center gap-2">
              {board.projectId === defaultProjectId && (
                <StarIcon
                  className="size-3.5 shrink-0 fill-current text-amber-400"
                  aria-label={t(summaryKey('defaultBadge'))}
                />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">
                {board.name.length > 0 ? board.name : '—'}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(summaryKey(board.kanbanMapping ? 'modeKanban' : 'modeFlat'))}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                // The board's own columns, not "the" mapping: which board the
                // wizard is about is exactly what the summary knows and the
                // step cannot guess.
                onClick={() => onEditMapping(String(board.projectId))}
              >
                {t(summaryKey('columns'))}
              </Button>
            </li>
          ))}
        </ul>

        <div className="mt-1">
          <Button type="button" size="sm" variant="outline" onClick={onPickScope}>
            {t(summaryKey('editBoards'))}
          </Button>
        </div>
      </div>

      <VikunjaPullPeriodSelect
        value={integration.config.pullPeriodMin ?? VIKUNJA_PULL_PERIOD_MIN}
        onChange={(pullPeriodMin) => {
          // The worker keeps no state: it picks the new period up from
          // `chrome.storage.onChanged` on this very write.
          actions.updateIntegrationConfig({ ...integration.config, pullPeriodMin })
        }}
      />

      {anyFlat && (
        <div
          data-testid={TestId.TodoSummaryFlatMode}
          className="grid gap-1.5 rounded-2xl border border-border bg-muted/20 px-3 py-2 text-sm"
        >
          <p className="text-muted-foreground">{t('integrations.vikunja.mapping.flatNotice')}</p>
          {/* Named rather than implied: "only Completed syncs" leaves the user
              to work out which statuses that leaves behind. */}
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t(summaryKey('localOnlyLabel'))}
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
