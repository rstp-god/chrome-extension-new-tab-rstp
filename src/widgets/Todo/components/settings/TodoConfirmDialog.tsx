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
  /**
   * The question's body. An array is rendered as one line per entry, for a
   * confirmation that has something to say about several things at once —
   * a board's worth of tasks each, which joined into one paragraph would be
   * a wall the user skims.
   */
  description: string | string[]
  /** Label of the accepting button — the action's own words, not "OK". */
  confirmLabel: string
  /** Paints the accepting button as destructive (disconnecting is). */
  destructive?: boolean
  /**
   * The answer is being carried out: both buttons are disabled, so a second
   * click cannot start the same irreversible action twice.
   */
  busy?: boolean
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
  busy,
  onConfirm,
}: Props) {
  const { t } = useTranslation('todoWidget')
  // `span`s rather than list markup: the description lives inside Radix's
  // `<p>` (which aria-describedby points at), where a `<ul>` would be
  // invalid HTML.
  const lines = Array.isArray(description) ? description : [description]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={TestId.TodoConfirmDialog} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {lines.map((line, index) => (
              <span key={index} className="block">
                {line}
              </span>
            ))}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('integrations.actions.cancel')}
          </Button>
          <Button
            data-testid={TestId.TodoConfirmAccept}
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
