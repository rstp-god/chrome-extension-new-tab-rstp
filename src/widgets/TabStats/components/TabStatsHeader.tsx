import { Settings2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'
import { TestId } from '@tests/constants/testIds.ts'

interface Props {
  onOpenSettings: () => void
}

export function TabStatsHeader({ onOpenSettings }: Props) {
  const { t } = useTranslation('tabStatsWidget')
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('title')}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t('periodTodayLabel')}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenSettings}
          aria-label={t('openSettings')}
          data-testid={TestId.TabStatsOpenSettings}
        >
          <Settings2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
