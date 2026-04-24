import type { ColorSchemePreset } from '@/types/appearance.ts'

/**
 * Chart palette preset data — shared with widget-level palette pickers.
 *
 * We reuse `ColorSchemePreset` from the global appearance theme so the same
 * i18n keys (`preset_default`, `preset_ocean`, …) translate both the theme
 * scheme selector and chart-palette presets. 'custom' is excluded — custom
 * colours come from the HEX input, not a preset.
 *
 * `src/styles/styles.css` holds duplicate fallback values for the same
 * `--chart-1`..`--chart-5` vars — keep the two lists in sync, TS cannot
 * import CSS variable values at compile time.
 */

export type ChartPalettePresetKey = Exclude<ColorSchemePreset, 'custom'>

/** key → base HEX. `Map` preserves insertion order for consistent UI rendering. */
export const CHART_PALETTE_PRESETS: ReadonlyMap<ChartPalettePresetKey, string> = new Map([
  ['default', '#38A0D6'],
  ['ocean', '#14B8A6'],
  ['forest', '#4CAF50'],
  ['sunset', '#F59E0B'],
  ['lavender', '#A78BFA'],
  ['mono', '#6B7280'],
])

export const DEFAULT_CHART_BASE_HEX = CHART_PALETTE_PRESETS.get('default')!

/**
 * Lightness ramp applied by `generateChartPalette` — lightest → darkest.
 * Adding or removing entries here automatically resizes the palette; no tuple
 * shape to bump.
 */
export const CHART_SHADE_LIGHTNESSES: readonly number[] = [0.865, 0.715, 0.609, 0.52, 0.45]

/**
 * Default 5 OKLCH shades derived from the Blue preset (lightest → darkest).
 * Kept as a static constant so the store can seed without running the
 * generator at module-init.
 */
export const DEFAULT_CHART_SHADES: readonly string[] = [
  'oklch(0.865 0.127 207.078)',
  'oklch(0.715 0.143 215.221)',
  'oklch(0.609 0.126 221.723)',
  'oklch(0.52 0.105 223.128)',
  'oklch(0.45 0.085 224.283)',
]
