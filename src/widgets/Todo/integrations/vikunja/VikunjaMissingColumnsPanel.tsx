import { PlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'
import { TestId } from '@tests/constants/testIds.ts'

import type { TodoStatus } from '@/widgets/Todo/integrations/types.ts'

export interface MissingColumn {
  status: TodoStatus
  /** Already translated: the panel shows it and the adapter creates it under this name. */
  title: string
}

interface Props {
  columns: MissingColumn[]
  busy: boolean
  onCreate: () => void
}

/**
 * The offer to build the columns a board does not have.
 *
 * A three-column Vikunja board (`To-Do` / `Doing` / `Done`) has nowhere to
 * put `struggle` and `deleted`. Creating them is one way out; flat mode is
 * the other, and it lives in its own section below the rows so it is on offer
 * whether or not the board is missing anything.
 */
export function VikunjaMissingColumnsPanel({ columns, busy, onCreate }: Props) {
  const { t } = useTranslation('todoWidget')

  return (
    <div
      data-testid={TestId.TodoMissingColumnsPanel}
      className="grid gap-2 rounded-2xl border border-border bg-muted/20 p-3 text-sm"
    >
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
              {t(`integrations.mapping.row.${column.status}`)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-1">
        <Button type="button" size="sm" onClick={onCreate} disabled={busy}>
          {t('integrations.vikunja.mapping.createButton', { n: columns.length })}
        </Button>
      </div>
    </div>
  )
}
