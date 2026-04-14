import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { FONT_CSS } from '@/newtab/components/Settings/presets.ts'
import { useAppearanceStore } from '@/store/appearance.ts'
import type { FontFamily } from '@/types/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'

const FONT_OPTIONS: { value: FontFamily; labelKey: string }[] = [
  { value: 'jetbrains', labelKey: 'fontJetBrains' },
  { value: 'inter', labelKey: 'fontInter' },
  { value: 'system', labelKey: 'fontSystem' },
  { value: 'plex', labelKey: 'fontPlex' },
]

export function FontSelector() {
  const { t } = useTranslation('settingsDialog')
  const font = useAppearanceStore((s) => s.font)
  const setFont = useAppearanceStore((s) => s.setFont)

  return (
    <div className="flex flex-col gap-3" data-testid={TestId.AppearanceFontSelector}>
      <p className="text-xs text-muted-foreground">{t('fontDescription')}</p>

      <ToggleGroup
        type="single"
        value={font}
        onValueChange={(v) => v && setFont(v as FontFamily)}
        variant="outline"
        size="sm"
        spacing={0}
      >
        {FONT_OPTIONS.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div
        className="rounded-lg border border-border bg-muted/50 p-3 text-sm"
        style={{ fontFamily: FONT_CSS[font] }}
      >
        {t('fontPreview')}
      </div>
    </div>
  )
}
