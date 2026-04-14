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
  ThemeColorKey,
} from '@/types/appearance.ts'
import { GRID_PRESETS } from '@/data/appearance.ts'
import { rescaleLayout } from '@/utils/grid.ts'
import { create } from 'zustand/react'

interface AppearanceStore extends AppearanceSettingsV1 {
  setColorScheme: (preset: ColorSchemePreset) => void
  setCustomColor: (theme: 'light' | 'dark', key: ThemeColorKey, value: string) => void
  setRadius: (value: number) => void
  setCardOpacity: (value: number) => void
  setFont: (font: FontFamily) => void
  setGridPreset: (preset: GridPreset) => Promise<void>
  setGridCustom: (
    config: Partial<Pick<GridConfig, 'columns' | 'rowHeight' | 'gap'>>,
  ) => Promise<void>
  resetToDefaults: () => Promise<void>
}

/**
 * Rescale the widget layout in memory and PERSIST it before the caller
 * mutates appearance state. Awaiting the widget commit first keeps the two
 * Chrome-synced envelopes in a sane order: if Chrome closes mid-operation,
 * the widget layout is already in storage; the worst case is that appearance
 * still reads the old columns count, which is recoverable at the next tick.
 * Without the await the two envelopes race on `chrome.storage.local.set`.
 */
async function rescaleWidgets(oldCols: number, newCols: number): Promise<void> {
  if (oldCols === newCols) return
  const widgetStore = useWidgetStore.getState()
  const rescaled = rescaleLayout(widgetStore.layout, oldCols, newCols)
  const widgets = widgetStore.widgets.map((w) => {
    const next = rescaled.find((l) => l.i === w.layout.i)
    return next ? { ...w, layout: { ...w.layout, x: next.x, w: next.w } } : w
  })
  widgetStore.setWidgets(widgets)
  await widgetStore.commit()
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

    setGridPreset: async (preset) => {
      const current = getState().grid
      if (preset === 'custom') {
        if (current.preset === 'custom') return
        setState({ grid: { ...current, preset: 'custom' } })
        return
      }
      const values = GRID_PRESETS[preset]
      await rescaleWidgets(current.columns, values.columns)
      setState({ grid: { preset, ...values } })
    },

    setGridCustom: async (config) => {
      const current = getState().grid
      const next: GridConfig = {
        preset: 'custom',
        columns: config.columns ?? current.columns,
        rowHeight: config.rowHeight ?? current.rowHeight,
        gap: config.gap ?? current.gap,
      }
      if (config.columns !== undefined) {
        await rescaleWidgets(current.columns, next.columns)
      }
      setState({ grid: next })
    },

    resetToDefaults: async () => {
      const current = getState().grid
      await rescaleWidgets(current.columns, DEFAULT_APPEARANCE.grid.columns)
      setState({ ...DEFAULT_APPEARANCE })
    },
  })),
)
