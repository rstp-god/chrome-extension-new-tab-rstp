import type { ColorSchemePreset, CustomColors, FontFamily, GridPreset } from '@/types/appearance.ts'

type ColorPresetMap = Record<Exclude<ColorSchemePreset, 'custom'>, CustomColors>

/**
 * Color presets — each holds light/dark variants of primary, accent, muted.
 * "default" reflects the existing tokens from src/styles/styles.css.
 */
export const COLOR_PRESETS: ColorPresetMap = {
  default: {
    light: {
      primary: 'oklch(0.52 0.105 223.128)',
      accent: 'oklch(0.96 0.002 17.2)',
      muted: 'oklch(0.96 0.002 17.2)',
    },
    dark: {
      primary: 'oklch(0.45 0.085 224.283)',
      accent: 'oklch(0.268 0.011 36.5)',
      muted: 'oklch(0.268 0.011 36.5)',
    },
  },
  ocean: {
    light: {
      primary: 'oklch(0.55 0.15 230)',
      accent: 'oklch(0.94 0.02 230)',
      muted: 'oklch(0.94 0.015 230)',
    },
    dark: {
      primary: 'oklch(0.55 0.15 230)',
      accent: 'oklch(0.25 0.03 230)',
      muted: 'oklch(0.22 0.02 230)',
    },
  },
  forest: {
    light: {
      primary: 'oklch(0.5 0.12 155)',
      accent: 'oklch(0.95 0.02 155)',
      muted: 'oklch(0.94 0.015 155)',
    },
    dark: {
      primary: 'oklch(0.55 0.12 155)',
      accent: 'oklch(0.25 0.03 155)',
      muted: 'oklch(0.22 0.02 155)',
    },
  },
  sunset: {
    light: {
      primary: 'oklch(0.6 0.16 50)',
      accent: 'oklch(0.95 0.03 50)',
      muted: 'oklch(0.94 0.02 40)',
    },
    dark: {
      primary: 'oklch(0.6 0.16 50)',
      accent: 'oklch(0.28 0.04 40)',
      muted: 'oklch(0.24 0.02 35)',
    },
  },
  lavender: {
    light: {
      primary: 'oklch(0.55 0.13 300)',
      accent: 'oklch(0.95 0.025 300)',
      muted: 'oklch(0.94 0.015 290)',
    },
    dark: {
      primary: 'oklch(0.6 0.13 300)',
      accent: 'oklch(0.26 0.04 290)',
      muted: 'oklch(0.23 0.02 285)',
    },
  },
  mono: {
    light: {
      primary: 'oklch(0.45 0 0)',
      accent: 'oklch(0.94 0 0)',
      muted: 'oklch(0.93 0 0)',
    },
    dark: {
      primary: 'oklch(0.6 0 0)',
      accent: 'oklch(0.25 0 0)',
      muted: 'oklch(0.22 0 0)',
    },
  },
}

export const RADIUS_PRESETS = [
  { key: 'sharp', value: 0.25 },
  { key: 'soft', value: 0.625 },
  { key: 'default', value: 0.875 },
  { key: 'round', value: 1.25 },
  { key: 'pill', value: 1.5 },
] as const

export type RadiusPresetKey = (typeof RADIUS_PRESETS)[number]['key']

export const GRID_PRESETS: Record<
  Exclude<GridPreset, 'custom'>,
  { columns: number; rowHeight: number; gap: number }
> = {
  compact: { columns: 16, rowHeight: 24, gap: 8 },
  default: { columns: 12, rowHeight: 30, gap: 12 },
  spacious: { columns: 8, rowHeight: 40, gap: 16 },
}

export const FONT_CSS: Record<FontFamily, string> = {
  jetbrains: "'JetBrains Mono Variable', monospace",
  inter: "'Inter Variable', sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  plex: "'IBM Plex Mono', monospace",
}

/**
 * Default --card color (oklch without alpha) per theme, sourced from
 * src/styles/styles.css. Used by useApplyAppearance to inject cardOpacity.
 */
export const CARD_BASE: Record<'light' | 'dark', string> = {
  light: 'oklch(1 0 0)',
  dark: 'oklch(0.214 0.009 43.1)',
}

/**
 * Resolve the three theme colors based on selected scheme and active theme.
 * Returns a plain {primary, accent, muted} object of oklch strings.
 */
export function resolveColors(
  scheme: ColorSchemePreset,
  customColors: CustomColors,
  theme: 'light' | 'dark',
): { primary: string; accent: string; muted: string } {
  if (scheme === 'custom') return customColors[theme]
  return COLOR_PRESETS[scheme][theme]
}
