import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { ColorInput } from '@/newtab/components/Settings/ColorInput.tsx'
import { COLOR_PRESETS } from '@/newtab/components/Settings/presets.ts'
import { useAppearanceStore } from '@/store/appearance.ts'
import type { ColorSchemePreset, ThemeColors } from '@/types/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const PRESET_KEYS: ColorSchemePreset[] = [
  'default',
  'ocean',
  'forest',
  'sunset',
  'lavender',
  'mono',
  'custom',
]

export function ColorSchemeSelector() {
  const { t } = useTranslation('settingsDialog')
  const colorScheme = useAppearanceStore((s) => s.colorScheme)
  const customColors = useAppearanceStore((s) => s.customColors)
  const setColorScheme = useAppearanceStore((s) => s.setColorScheme)
  const setCustomColor = useAppearanceStore((s) => s.setCustomColor)

  const [editingTheme, setEditingTheme] = useState<'light' | 'dark'>('dark')

  const handleChange = (value: string) => {
    if (!value) return
    setColorScheme(value as ColorSchemePreset)
  }

  const editingColors = customColors[editingTheme]

  const handleCustomColor = (key: keyof ThemeColors, next: string) => {
    setCustomColor(editingTheme, key, next)
  }

  return (
    <div className="flex flex-col gap-3" data-testid={TestId.AppearanceColorScheme}>
      <p className="text-xs text-muted-foreground">{t('colorSchemeDescription')}</p>

      <ToggleGroup
        type="single"
        value={colorScheme}
        onValueChange={handleChange}
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
      >
        {PRESET_KEYS.map((key) => {
          const swatch =
            key === 'custom'
              ? customColors.dark.primary
              : COLOR_PRESETS[key as Exclude<ColorSchemePreset, 'custom'>].dark.primary
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

          <ColorInput
            label={t('primaryColor')}
            value={editingColors.primary}
            onChange={(v) => handleCustomColor('primary', v)}
          />
          <ColorInput
            label={t('accentColor')}
            value={editingColors.accent}
            onChange={(v) => handleCustomColor('accent', v)}
          />
          <ColorInput
            label={t('mutedColor')}
            value={editingColors.muted}
            onChange={(v) => handleCustomColor('muted', v)}
          />
        </div>
      )}
    </div>
  )
}
