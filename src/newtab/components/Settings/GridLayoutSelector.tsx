import { SliderRow } from '@/components/compiled/SliderRow.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { useAppearanceStore } from '@/store/appearance.ts'
import { GRID_PRESET_KEYS, type GridConfig, type GridPreset } from '@/types/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

const PRESET_LABEL_KEY: Record<GridPreset, string> = {
  compact: 'gridCompact',
  default: 'gridDefault',
  spacious: 'gridSpacious',
  custom: 'gridCustom',
}

type CustomField = keyof Pick<GridConfig, 'columns' | 'rowHeight' | 'gap'>

type SliderDef = {
  field: CustomField
  labelKey: string
  min: number
  max: number
  step: number
  suffix: '' | 'px'
}

const CUSTOM_SLIDERS: SliderDef[] = [
  { field: 'columns', labelKey: 'columns', min: 6, max: 24, step: 1, suffix: '' },
  { field: 'rowHeight', labelKey: 'rowHeight', min: 20, max: 60, step: 2, suffix: 'px' },
  { field: 'gap', labelKey: 'gap', min: 4, max: 24, step: 1, suffix: 'px' },
]

export function GridLayoutSelector() {
  const { t } = useTranslation('settingsDialog')
  const { grid, setGridPreset, setGridCustom } = useAppearanceStore(
    useShallow((s) => ({
      grid: s.grid,
      setGridPreset: s.setGridPreset,
      setGridCustom: s.setGridCustom,
    })),
  )

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
        {GRID_PRESET_KEYS.map((key) => (
          <ToggleGroupItem key={key} value={key}>
            {t(PRESET_LABEL_KEY[key])}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {grid.preset === 'custom' && (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
          {CUSTOM_SLIDERS.map(({ field, labelKey, min, max, step, suffix }) => (
            <SliderRow
              key={field}
              label={t(labelKey)}
              value={grid[field]}
              min={min}
              max={max}
              step={step}
              formatter={(v) => `${v}${suffix}`}
              onChange={(v) => setGridCustom({ [field]: v })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
