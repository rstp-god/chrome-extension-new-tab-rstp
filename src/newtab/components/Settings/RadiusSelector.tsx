import { Slider } from '@/components/ui/slider.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { RADIUS_PRESETS, type RadiusPresetKey } from '@/data/appearance.ts'
import { useAppearanceStore } from '@/store/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

export function RadiusSelector() {
  const { t } = useTranslation('settingsDialog')
  const { radius, setRadius } = useAppearanceStore(
    useShallow((s) => ({ radius: s.radius, setRadius: s.setRadius })),
  )

  const activePreset = RADIUS_PRESETS.find((p) => Math.abs(p.value - radius) < 0.001)?.key ?? ''

  const handlePreset = (value: string) => {
    if (!value) return
    const preset = RADIUS_PRESETS.find((p) => p.key === value)
    if (preset) setRadius(preset.value)
  }

  return (
    <div className="flex flex-col gap-3" data-testid={TestId.AppearanceRadiusSlider}>
      <p className="text-xs text-muted-foreground">{t('cornerDescription')}</p>

      <div className="flex items-center gap-3">
        <Slider
          value={[radius]}
          min={0.25}
          max={1.5}
          step={0.125}
          onValueChange={(v) => setRadius(v[0] ?? radius)}
        />
        <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {radius.toFixed(3)}rem
        </span>
      </div>

      <ToggleGroup
        type="single"
        value={activePreset}
        onValueChange={handlePreset}
        variant="outline"
        size="sm"
        spacing={0}
      >
        {RADIUS_PRESETS.map((p) => (
          <ToggleGroupItem key={p.key} value={p.key}>
            {t(p.key as RadiusPresetKey)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
