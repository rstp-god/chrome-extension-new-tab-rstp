import { Synced, withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import { appearanceEnvelopeSchema } from '@/services/zod/appearance.ts'
import { useWidgetStore } from '@/store/widget.ts'
import {
  APPEARANCE_SETTINGS_KEY,
  AppearanceSettingsV1,
  ColorSchemePreset,
  DEFAULT_APPEARANCE,
  FontFamily,
  GridConfig,
  GridPreset,
  ThemeColors,
} from '@/types/appearance.ts'
import { rescaleLayout } from '@/utils/grid.ts'
import { create } from 'zustand/react'

interface AppearanceStore extends AppearanceSettingsV1 {
  setColorScheme: (preset: ColorSchemePreset) => void
  setCustomColor: (theme: 'light' | 'dark', key: keyof ThemeColors, value: string) => void
  setRadius: (value: number) => void
  setCardOpacity: (value: number) => void
  setFont: (font: FontFamily) => void
  setGridPreset: (preset: GridPreset) => void
  setGridCustom: (config: Partial<Pick<GridConfig, 'columns' | 'rowHeight' | 'gap'>>) => void
  resetToDefaults: () => void
}

const GRID_PRESET_VALUES: Record<Exclude<GridPreset, 'custom'>, Omit<GridConfig, 'preset'>> = {
  compact: { columns: 16, rowHeight: 24, gap: 8 },
  default: { columns: 12, rowHeight: 30, gap: 12 },
  spacious: { columns: 8, rowHeight: 40, gap: 16 },
}

function rescaleWidgets(oldCols: number, newCols: number): void {
  if (oldCols === newCols) return
  const widgetStore = useWidgetStore.getState()
  const rescaled = rescaleLayout(widgetStore.layout, oldCols, newCols)
  const widgets = widgetStore.widgets.map((w) => {
    const next = rescaled.find((l) => l.i === w.layout.i)
    return next ? { ...w, layout: { ...w.layout, x: next.x, w: next.w } } : w
  })
  widgetStore.setWidgets(widgets)
  void widgetStore.commit()
}

export const useAppearanceStore = create<Synced<AppearanceStore>>()(
  withChromeSync<AppearanceStore, AppearanceSettingsV1>({
    key: APPEARANCE_SETTINGS_KEY,
    schema: appearanceEnvelopeSchema,
    partialize: (s) => ({
      version: 1,
      colorScheme: s.colorScheme,
      customColors: s.customColors,
      radius: s.radius,
      cardOpacity: s.cardOpacity,
      font: s.font,
      grid: s.grid,
    }),
    merge: (_cur, incoming) => incoming,
  })((setState, getState) => ({
    ...DEFAULT_APPEARANCE,

    setColorScheme: (preset) => setState({ colorScheme: preset }),

    setCustomColor: (theme, key, value) =>
      setState((s) => ({
        colorScheme: 'custom',
        customColors: {
          ...s.customColors,
          [theme]: { ...s.customColors[theme], [key]: value },
        },
      })),

    setRadius: (value) => setState({ radius: value }),

    setCardOpacity: (value) => setState({ cardOpacity: value }),

    setFont: (font) => setState({ font }),

    setGridPreset: (preset) => {
      const current = getState().grid
      if (preset === 'custom') {
        setState({ grid: { ...current, preset: 'custom' } })
        return
      }
      const values = GRID_PRESET_VALUES[preset]
      rescaleWidgets(current.columns, values.columns)
      setState({ grid: { preset, ...values } })
    },

    setGridCustom: (config) => {
      const current = getState().grid
      const next: GridConfig = {
        preset: 'custom',
        columns: config.columns ?? current.columns,
        rowHeight: config.rowHeight ?? current.rowHeight,
        gap: config.gap ?? current.gap,
      }
      if (config.columns !== undefined) {
        rescaleWidgets(current.columns, next.columns)
      }
      setState({ grid: next })
    },

    resetToDefaults: () => {
      const current = getState().grid
      if (current.columns !== DEFAULT_APPEARANCE.grid.columns) {
        rescaleWidgets(current.columns, DEFAULT_APPEARANCE.grid.columns)
      }
      setState({ ...DEFAULT_APPEARANCE })
    },
  })),
)
