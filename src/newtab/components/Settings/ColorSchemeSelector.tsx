import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { ColorInput } from '@/newtab/components/Settings/ColorInput.tsx'
import { COLOR_PRESETS } from '@/newtab/components/Settings/presets.ts'
import { useAppearanceStore } from '@/store/appearance.ts'
import {
  COLOR_SCHEME_PRESETS,
  THEME_COLOR_KEYS,
  type ColorSchemePreset,
  type ThemeColorKey,
} from '@/types/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

const COLOR_LABEL_KEY: Record<ThemeColorKey, string> = {
  primary: 'primaryColor',
  accent: 'accentColor',
  muted: 'mutedColor',
}

export function ColorSchemeSelector() {
  const { t } = useTranslation('settingsDialog')
  const { colorScheme, customColors, setColorScheme, setCustomColor } = useAppearanceStore(
    useShallow((s) => ({
      colorScheme: s.colorScheme,
      customColors: s.customColors,
      setColorScheme: s.setColorScheme,
      setCustomColor: s.setCustomColor,
    })),
  )

  const [editingTheme, setEditingTheme] = useState<'light' | 'dark'>('dark')

  const handleSchemeChange = (value: string) => {
    if (!value) return
    setColorScheme(value as ColorSchemePreset)
  }

  const editingColors = customColors[editingTheme]

  return (
    <div className="flex flex-col gap-3" data-testid={TestId.AppearanceColorScheme}>
      <p className="text-xs text-muted-foreground">{t('colorSchemeDescription')}</p>

      <ToggleGroup
        type="single"
        value={colorScheme}
        onValueChange={handleSchemeChange}
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
      >
        {COLOR_SCHEME_PRESETS.map((key) => {
          const swatch =
            key === 'custom'
              ? customColors.dark.primary
              : COLOR_PRESETS[key].dark.primary
          return (
            <ToggleGroupItem key={key} value={key} className="gap-2">
              <span
                className="inline-block size-3 rounded-full border border-border"
                style={{ backgroundColor: swatch }}
              />
              {t(`preset_${key}`)}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>

      {colorScheme === 'custom' && (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <ToggleGroup
            type="single"
            value={editingTheme}
            onValueChange={(v) => v && setEditingTheme(v as 'light' | 'dark')}
            variant="outline"
            size="sm"
            spacing={0}
          >
            <ToggleGroupItem value="light">{t('editLight')}</ToggleGroupItem>
            <ToggleGroupItem value="dark">{t('editDark')}</ToggleGroupItem>
          </ToggleGroup>

          {THEME_COLOR_KEYS.map((key) => (
            <ColorInput
              key={key}
              label={t(COLOR_LABEL_KEY[key])}
              value={editingColors[key]}
              onChange={(next) => setCustomColor(editingTheme, key, next)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
