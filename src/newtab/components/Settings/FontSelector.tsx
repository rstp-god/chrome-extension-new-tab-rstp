import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { FONT_CSS } from '@/newtab/components/Settings/presets.ts'
import { useAppearanceStore } from '@/store/appearance.ts'
import { FONT_FAMILIES, type FontFamily } from '@/types/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

const FONT_LABEL_KEY: Record<FontFamily, string> = {
  jetbrains: 'fontJetBrains',
  inter: 'fontInter',
  system: 'fontSystem',
  plex: 'fontPlex',
}

export function FontSelector() {
  const { t } = useTranslation('settingsDialog')
  const { font, setFont } = useAppearanceStore(
    useShallow((s) => ({ font: s.font, setFont: s.setFont })),
  )

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
        {FONT_FAMILIES.map((value) => (
          <ToggleGroupItem key={value} value={value}>
            {t(FONT_LABEL_KEY[value])}
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
