import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'

interface Props {
  /** `true` while the persisted config is already in flat mode. */
  active: boolean
  /** `false` when the view has no done bucket — then not even "done" syncs. */
  available: boolean
  busy: boolean
  onSkip: () => void
}

/**
 * The way out of the bucket mapping, always on offer.
 *
 * A user who does not want `struggle` / `deleted` columns in their tracker
 * needs this whether or not the board happens to be missing them, so it sits
 * below the rows rather than inside the "create the missing columns" panel.
 *
 * When flat mode is already the persisted choice the section says so — and
 * says what saving a full mapping would do — because the rows above then show
 * a fresh suggestion rather than what is currently in effect.
 */
export function VikunjaFlatModeSection({ active, available, busy, onSkip }: Props) {
  const { t } = useTranslation('todoWidget')

  if (!available) return null

  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-muted/20 px-3 py-2 text-sm">
      <p className="text-muted-foreground" role={active ? 'alert' : undefined}>
        {t('integrations.vikunja.mapping.flatNotice')}
      </p>

      {active ? (
        <p className="text-xs text-muted-foreground">
          {t('integrations.vikunja.mapping.flatActive')}
        </p>
      ) : (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={onSkip} disabled={busy}>
            {t('integrations.vikunja.mapping.skipFlat')}
          </Button>
        </div>
      )}
    </div>
  )
}
