import { ActivityIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function ScreenTimeEmpty() {
  const { t } = useTranslation('screenTimeWidget')
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 p-6 text-center">
      <ActivityIcon className="size-8 text-muted-foreground/60" aria-hidden />
      <p className="text-sm font-medium">{t('empty.title')}</p>
      <p className="text-xs text-muted-foreground">{t('empty.subtitle')}</p>
    </div>
  )
}
