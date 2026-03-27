import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { BackgroundDialog } from '@/newtab/components/Background/BackgroundDialog.tsx';
import { useHeaderStore } from '@/store/header.ts';
import { BackgroundStateV1 } from '@/types/background.ts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  bgState: BackgroundStateV1;
  onSaveBackground: (next: BackgroundStateV1) => Promise<void> | void;
}

export function SettingsDialog({ bgState, onSaveBackground }: Props) {
  const { t: header } = useTranslation('header');
  const { t } = useTranslation('settingsDialog');
  const { t: common } = useTranslation('common');

  const [ open, setOpen ] = useState(false);
  const [ bgOpen, setBgOpen ] = useState(false);
  const { displayName, theme, setDisplayName, toggleTheme, language, setLanguage } = useHeaderStore(s => s);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{header('settings')}</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{header('settings')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
            <div className="grid gap-1">
              <div className="text-sm font-medium">{t('theme')}</div>
              <div className="text-xs text-muted-foreground">{t('themeDescription')}</div>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{common('light')}</Label>
              <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme}/>
              <Label className="text-xs text-muted-foreground">{common('dark')}</Label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
            <div className="grid gap-1">
              <div className="text-sm font-medium">{t('language')}</div>
              <div className="text-xs text-muted-foreground">{t('languageDescription')}</div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={language === 'en' ? 'default' : 'outline'}
                onClick={() => setLanguage('en')}
              >
                {t('english')}
              </Button>
              <Button
                size="sm"
                variant={language === 'ru' ? 'default' : 'outline'}
                onClick={() => setLanguage('ru')}
              >
                {t('russian')}
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium">{t('name')}</div>
            <div className="text-xs text-muted-foreground">{t('nameDescription')}</div>

            <Input
              value={displayName ?? ''}
              placeholder={t('namePlaceholder')}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

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

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {common('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
