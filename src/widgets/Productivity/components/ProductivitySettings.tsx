import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Settings } from 'lucide-react'

import { Button } from '@/components/ui/button.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { isShowcaseMode } from '@/services/chrome/runtime.ts'
import { rebuildDailyCache } from '@/widgets/Productivity/lib/dailyCache.ts'
import { useProductivityStore } from '@/widgets/Productivity/store/useProductivityStore.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { TestId } from '@tests/constants/testIds.ts'

export function ProductivitySettings() {
  const { t } = useTranslation('productivityWidget')
  const [isRebuilding, setIsRebuilding] = useState(false)

  const showFullFlow = useProductivityStore((s) => s.showFullFlow)
  const showPlanned = useProductivityStore((s) => s.showPlanned)
  const showWip = useProductivityStore((s) => s.showWip)
  const splitWeekdayWeekend = useProductivityStore((s) => s.splitWeekdayWeekend)
  const setShowMetric = useProductivityStore((s) => s.setShowMetric)
  const setSplitWeekdayWeekend = useProductivityStore((s) => s.setSplitWeekdayWeekend)
  const refresh = useProductivityStore((s) => s.refresh)

  const handleRebuild = async () => {
    setIsRebuilding(true)
    try {
      await rebuildDailyCache(useTodoStore.getState().tasks)
      await refresh()
    } finally {
      setIsRebuilding(false)
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('settings.openLabel')}
          data-testid={TestId.ProductivityOpenSettings}
        >
          <Settings />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('settings.title')}</SheetTitle>
          <SheetDescription>{t('settings.description')}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="productivity-show-full-flow">{t('settings.showFullFlow')}</Label>
            <Switch
              id="productivity-show-full-flow"
              checked={showFullFlow}
              onCheckedChange={(value) => setShowMetric('showFullFlow', value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="productivity-show-planned">{t('settings.showPlanned')}</Label>
            <Switch
              id="productivity-show-planned"
              checked={showPlanned}
              onCheckedChange={(value) => setShowMetric('showPlanned', value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="productivity-show-wip">{t('settings.showWip')}</Label>
            <Switch
              id="productivity-show-wip"
              checked={showWip}
              onCheckedChange={(value) => setShowMetric('showWip', value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="productivity-split-weekday-weekend">
              {t('settings.splitWeekdayWeekend')}
            </Label>
            <Switch
              id="productivity-split-weekday-weekend"
              checked={splitWeekdayWeekend}
              onCheckedChange={(value) => setSplitWeekdayWeekend(value)}
            />
          </div>

          <Separator />

          <Button
            variant="destructive"
            disabled={isRebuilding || isShowcaseMode()}
            onClick={() => void handleRebuild()}
          >
            {t('settings.rebuildHistory')}
          </Button>

          <p className="text-xs text-muted-foreground">{t('settings.baselineHint')}</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
