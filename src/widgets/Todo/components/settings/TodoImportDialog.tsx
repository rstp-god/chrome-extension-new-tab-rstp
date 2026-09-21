import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'

import type { TodoTask } from '@/widgets/Todo/store/store.ts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The unlinked local tasks, as the summary selected them. */
  tasks: TodoTask[]
  /** Human name of the destination (board / project), for the wording. */
  scopeName: string
  onConfirm: (ids: string[]) => void
}

/**
 * What "import my local tasks" will actually do, before it does it.
 *
 * The preview is the point: creating records in someone's own tracker is not
 * undoable from here, and the count in the summary's button does not say
 * *which* tasks — a list that turns out to hold three years of abandoned
 * todos is exactly what the user should see before pressing Import. Scrolls
 * rather than truncates, so nothing is hidden from that decision.
 */
export function TodoImportDialog({ open, onOpenChange, tasks, scopeName, onConfirm }: Props) {
  const { t } = useTranslation('todoWidget')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={TestId.TodoImportDialog} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('integrations.import.title')}</DialogTitle>
          <DialogDescription>
            {t('integrations.import.description', { scope: scopeName })}
          </DialogDescription>
        </DialogHeader>

        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('integrations.import.empty')}</p>
        ) : (
          <ScrollArea className="max-h-64 rounded-2xl border border-border bg-muted/20">
            <ul className="grid gap-1 p-3 text-sm">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-baseline gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span className="min-w-0 break-words">{task.title}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('integrations.import.cancel')}
          </Button>
          <Button
            data-testid={TestId.TodoImportConfirm}
            type="button"
            disabled={tasks.length === 0}
            onClick={() => onConfirm(tasks.map((task) => task.id))}
          >
            {t('integrations.import.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
