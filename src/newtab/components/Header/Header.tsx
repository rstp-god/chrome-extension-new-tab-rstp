import { Button } from '@/components/ui/button.tsx'
import AddWidgetDialog from '@/newtab/components/Header/AddWidgetDialog.tsx'
import { getGreetingPeriod } from '@/newtab/components/Header/utils/getGreetings.ts'
import { isShowcaseMode } from '@/services/chrome/runtime.ts'
import { useHeaderStore } from '@/store/header.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useWidgetStore } from '@/store/widget.ts'
import { BackgroundStateV1 } from '@/types/background.ts'
import { PinIcon, PinOffIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SettingsDialog } from './SettingsDialog'

interface Props {
  bgState: BackgroundStateV1
  onSaveBackground: (next: BackgroundStateV1) => Promise<void> | void
}

export function Header(props: Props) {
  const { t } = useTranslation('header')
  const { t: common } = useTranslation('common')

  const { displayName, pinned, togglePinned } = useHeaderStore((s) => s)
  const { commit } = useWidgetStore((s) => s)

  const greeting = t(`greetings.${getGreetingPeriod()}`)
  const greetingLine = t('greetingLine', {
    greeting,
    name: displayName ?? common('guest'),
  })

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="text-lg font-semibold tracking-tight">{greetingLine}</div>
        {isShowcaseMode() && (
          <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            {t('demoMode')}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          data-testid={TestId.PinToggle}
          variant="ghost"
          onClick={() => {
            commit()
            togglePinned()
          }}
        >
          {pinned ? <PinIcon /> : <PinOffIcon />}
        </Button>
        {!pinned && <AddWidgetDialog />}
        <SettingsDialog {...props} />
      </div>
    </div>
  )
}
