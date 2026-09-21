import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Label of the accepting button — the action's own words, not "OK". */
  confirmLabel: string
  /** Paints the accepting button as destructive (disconnecting is). */
  destructive?: boolean
  onConfirm: () => void
}

/**
 * The "are you sure" for the two settings actions that cannot be undone from
 * the UI.
 *
 * A real dialog rather than `window.confirm`: the native one is unstyled, is
 * blocked outright in some contexts, and — inside an extension page — steals
 * focus from the dialog it was opened over, which is how the settings dialog
 * used to end up closed with the confirmation still on screen. Radix nests
 * fine, so this one opens over the settings dialog and hands focus back when
 * it closes.
 */
export function TodoConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: Props) {
  const { t } = useTranslation('todoWidget')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={TestId.TodoConfirmDialog} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('integrations.actions.cancel')}
          </Button>
          <Button
            data-testid={TestId.TodoConfirmAccept}
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
