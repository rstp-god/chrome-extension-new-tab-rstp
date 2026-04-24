import { Settings2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import type { ScreenTimePeriod } from '@/background/activity/types.ts'
import { SCREEN_TIME_PERIODS } from '@/background/activity/types.ts'
import { toHoursMinutes } from '@/widgets/ScreenTime/utils/duration.ts'
import { TestId } from '@tests/constants/testIds.ts'

interface Props {
  totalSeconds: number
  period: ScreenTimePeriod
  onPeriodChange: (next: ScreenTimePeriod) => void
  onOpenSettings: () => void
}

export function ScreenTimeHeader({ totalSeconds, period, onPeriodChange, onOpenSettings }: Props) {
  const { t } = useTranslation('screenTimeWidget')
  const { hours, minutes, subMinute } = toHoursMinutes(totalSeconds)

  const total = subMinute
    ? t('totalBelowMinute')
    : hours > 0
      ? t('totalHoursMinutes', { hours, minutes })
      : t('totalMinutes', { minutes })

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('title')}</span>
        <span className="mt-0.5 text-2xl font-semibold leading-tight">{total}</span>
      </div>

      <div className="flex items-center gap-1">
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(v) => {
            if (v) onPeriodChange(v as ScreenTimePeriod)
          }}
          variant="outline"
          size="sm"
          spacing={0}
        >
          {SCREEN_TIME_PERIODS.map((p) => (
            <ToggleGroupItem key={p} value={p} className="text-xs">
              {t(`period.${p}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenSettings}
          aria-label={t('openSettings')}
          data-testid={TestId.ScreenTimeOpenSettings}
        >
          <Settings2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
