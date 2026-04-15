import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { BackgroundDialog } from '@/newtab/components/Background/BackgroundDialog.tsx'
import { GeneralSettings } from '@/newtab/components/Header/GeneralSettings.tsx'
import { AppearanceSection } from '@/newtab/components/Settings/AppearanceSection.tsx'
import { TestId } from '@tests/constants/testIds.ts'
import { BackgroundStateV1 } from '@/types/background.ts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  bgState: BackgroundStateV1
  onSaveBackground: (next: BackgroundStateV1) => Promise<void> | void
}

export function SettingsDialog({ bgState, onSaveBackground }: Props) {
  const { t: header } = useTranslation('header')
  const { t } = useTranslation('settingsDialog')
  const { t: common } = useTranslation('common')

  const [open, setOpen] = useState(false)
  const [bgOpen, setBgOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid={TestId.SettingsTrigger} variant="outline">
          {header('settings')}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg" data-testid={TestId.SettingsDialog}>
        <DialogHeader>
          <DialogTitle>{header('settings')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto pr-3">
          <div className="grid gap-6">
            <GeneralSettings />

            <Separator />

            <AppearanceSection />

            <Separator />

            <Button variant="outline" onClick={() => setBgOpen(true)}>
              {t('changeBackground')}
            </Button>

            <BackgroundDialog
              open={bgOpen}
              onOpenChange={setBgOpen}
              value={bgState}
              onSaved={onSaveBackground}
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {common('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
