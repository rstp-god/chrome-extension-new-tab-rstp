import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TodoSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation('todoWidget')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          {t('settings.integrationsPlaceholder')}
        </div>
      </DialogContent>
    </Dialog>
  )
}
