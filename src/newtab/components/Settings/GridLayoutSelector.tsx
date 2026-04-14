import { Slider } from '@/components/ui/slider.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { useAppearanceStore } from '@/store/appearance.ts'
import type { GridPreset } from '@/types/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'

const PRESETS: { value: GridPreset; labelKey: string }[] = [
  { value: 'compact', labelKey: 'gridCompact' },
  { value: 'default', labelKey: 'gridDefault' },
  { value: 'spacious', labelKey: 'gridSpacious' },
  { value: 'custom', labelKey: 'gridCustom' },
]

export function GridLayoutSelector() {
  const { t } = useTranslation('settingsDialog')
  const grid = useAppearanceStore((s) => s.grid)
  const setGridPreset = useAppearanceStore((s) => s.setGridPreset)
  const setGridCustom = useAppearanceStore((s) => s.setGridCustom)

  return (
    <div className="flex flex-col gap-3" data-testid={TestId.AppearanceGridSelector}>
      <p className="text-xs text-muted-foreground">{t('gridDescription')}</p>

      <ToggleGroup
        type="single"
        value={grid.preset}
        onValueChange={(v) => v && setGridPreset(v as GridPreset)}
        variant="outline"
        size="sm"
        spacing={0}
      >
        {PRESETS.map((p) => (
          <ToggleGroupItem key={p.value} value={p.value}>
            {t(p.labelKey)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {grid.preset === 'custom' && (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <SliderRow
            label={t('columns')}
            value={grid.columns}
            min={6}
            max={24}
            step={1}
            formatter={(v) => String(v)}
            onChange={(v) => setGridCustom({ columns: v })}
          />
          <SliderRow
            label={t('rowHeight')}
            value={grid.rowHeight}
            min={20}
            max={60}
            step={2}
            formatter={(v) => `${v}px`}
            onChange={(v) => setGridCustom({ rowHeight: v })}
          />
          <SliderRow
            label={t('gap')}
            value={grid.gap}
            min={4}
            max={24}
            step={1}
            formatter={(v) => `${v}px`}
            onChange={(v) => setGridCustom({ gap: v })}
          />
        </div>
      )}
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  formatter,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  formatter: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
      <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {formatter(value)}
      </span>
    </div>
  )
}
