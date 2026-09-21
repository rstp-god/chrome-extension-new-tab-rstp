import { Button } from '@/components/ui/button.tsx'
import { PlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { TodoStatus } from '@/widgets/Todo/integrations/types.ts'

export interface MissingColumn {
  status: TodoStatus
  /** Already translated: the panel shows it and the adapter creates it under this name. */
  title: string
}

interface Props {
  columns: MissingColumn[]
  busy: boolean
  /** `false` when flat mode is impossible — the view has no done bucket. */
  canSkip: boolean
  onCreate: () => void
  onSkip: () => void
}

/**
 * The offer to build the columns a board does not have.
 *
 * A three-column Vikunja board (`To-Do` / `Doing` / `Done`) has nowhere to
 * put `struggle` and `deleted`, and the two ways out are genuinely different:
 * create the columns (full kanban sync) or accept flat mode (only "done"
 * round-trips). Both are offered here rather than hidden behind an empty
 * mapping row the user cannot fill.
 */
export function VikunjaMissingColumnsPanel({ columns, busy, canSkip, onCreate, onSkip }: Props) {
  const { t } = useTranslation('todoWidget')

  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-muted/20 p-3 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('integrations.vikunja.mapping.createMissingTitle')}
      </div>
      <p className="text-muted-foreground">
        {t('integrations.vikunja.mapping.createMissingDescription')}
      </p>

      <ul className="grid gap-1">
        {columns.map((column) => (
          <li key={column.status} className="flex items-center gap-2">
            <PlusIcon className="size-3.5 text-muted-foreground" />
            <span className="font-medium">{column.title}</span>
            <span className="text-xs text-muted-foreground">
              {t(`integrations.trello.mapping.row.${column.status}`)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onCreate} disabled={busy}>
          {t('integrations.vikunja.mapping.createButton', { n: columns.length })}
        </Button>
        {canSkip && (
          <Button type="button" size="sm" variant="ghost" onClick={onSkip} disabled={busy}>
            {t('integrations.vikunja.mapping.skipFlat')}
          </Button>
        )}
      </div>

      {canSkip && (
        <p className="text-xs text-muted-foreground">
          {t('integrations.vikunja.mapping.flatNotice')}
        </p>
      )}
    </div>
  )
}
