import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { useHeaderStore } from '@/store/header.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'

export function GeneralSettings() {
  const { t } = useTranslation('settingsDialog')
  const { t: common } = useTranslation('common')
  const { displayName, theme, setDisplayName, toggleTheme, language, setLanguage } = useHeaderStore(
    (s) => s,
  )

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
        <div className="grid gap-1">
          <div className="text-sm font-medium">{t('theme')}</div>
          <div className="text-xs text-muted-foreground">{t('themeDescription')}</div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{common('light')}</Label>
          <Switch
            data-testid={TestId.ThemeSwitch}
            checked={theme === 'dark'}
            onCheckedChange={toggleTheme}
          />
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
    </>
  )
}
