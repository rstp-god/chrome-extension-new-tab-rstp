import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { Settings } from 'lucide-react'

import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { isShowcaseMode } from '@/services/chrome/runtime.ts'
import { rebuildDailyCache } from '@/widgets/Productivity/lib/dailyCache.ts'
import { useProductivityStore } from '@/widgets/Productivity/store/useProductivityStore.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { TestId } from '@tests/constants/testIds.ts'

export function ProductivitySettings() {
  const { t } = useTranslation('productivityWidget')
  const [isRebuilding, setIsRebuilding] = useState(false)

  const {
    showFullFlow,
    showPlanned,
    showWip,
    splitWeekdayWeekend,
    setShowMetric,
    setSplitWeekdayWeekend,
    refresh,
  } = useProductivityStore(
    useShallow((s) => ({
      showFullFlow: s.showFullFlow,
      showPlanned: s.showPlanned,
      showWip: s.showWip,
      splitWeekdayWeekend: s.splitWeekdayWeekend,
      setShowMetric: s.setShowMetric,
      setSplitWeekdayWeekend: s.setSplitWeekdayWeekend,
      refresh: s.refresh,
    })),
  )

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
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('settings.openLabel')}
          data-testid={TestId.ProductivityOpenSettings}
        >
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
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
      </DialogContent>
    </Dialog>
  )
}
