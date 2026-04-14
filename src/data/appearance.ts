import type { ThemeMode } from '@/types/header.ts'
import type {
  ColorSchemePreset,
  CustomColors,
  FontFamily,
  GridConfig,
  GridPreset,
} from '@/types/appearance.ts'
import { computeForeground } from '@/utils/color.ts'

type NonCustom<K extends 'custom' | string> = Exclude<K, 'custom'>

/**
 * A fully-resolved palette for a single theme (light or dark). Includes both
 * the three background tokens AND their paired foregrounds, so `useApplyAppearance`
 * can write WCAG-balanced *-foreground values that match the preset designer's
 * intent rather than the binary computeForeground fallback (critical for the
 * "default" preset: it matches the mid-tone foregrounds declared in styles.css).
 */
export type Palette = {
  primary: string
  primaryForeground: string
  accent: string
  accentForeground: string
  muted: string
  mutedForeground: string
}

export type PaletteSet = { light: Palette; dark: Palette }

/**
 * Color presets — each holds light/dark palettes with explicit *-foreground
 * values. "default" mirrors the tokens declared in src/styles/styles.css so the
 * out-of-the-box theme renders identically to the original CSS file.
 */
export const COLOR_PRESETS: Record<NonCustom<ColorSchemePreset>, PaletteSet> = {
  default: {
    light: {
      primary: 'oklch(0.52 0.105 223.128)',
      primaryForeground: 'oklch(0.984 0.019 200.873)',
      accent: 'oklch(0.96 0.002 17.2)',
      accentForeground: 'oklch(0.214 0.009 43.1)',
      muted: 'oklch(0.96 0.002 17.2)',
      mutedForeground: 'oklch(0.547 0.021 43.1)',
    },
    dark: {
      primary: 'oklch(0.45 0.085 224.283)',
      primaryForeground: 'oklch(0.984 0.019 200.873)',
      accent: 'oklch(0.268 0.011 36.5)',
      accentForeground: 'oklch(0.986 0.002 67.8)',
      muted: 'oklch(0.268 0.011 36.5)',
      mutedForeground: 'oklch(0.714 0.014 41.2)',
    },
  },
  ocean: paletteSetComputed({
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
  }),
  forest: paletteSetComputed({
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
  }),
  sunset: paletteSetComputed({
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
  }),
  lavender: paletteSetComputed({
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
  }),
  mono: paletteSetComputed({
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
  }),
}

function paletteSetComputed(bg: {
  light: { primary: string; accent: string; muted: string }
  dark: { primary: string; accent: string; muted: string }
}): PaletteSet {
  return {
    light: withAutoForegrounds(bg.light),
    dark: withAutoForegrounds(bg.dark),
  }
}

function withAutoForegrounds(bg: { primary: string; accent: string; muted: string }): Palette {
  return {
    ...bg,
    primaryForeground: computeForeground(bg.primary),
    accentForeground: computeForeground(bg.accent),
    mutedForeground: computeForeground(bg.muted),
  }
}

export const RADIUS_PRESETS = [
  { key: 'sharp', value: 0.25 },
  { key: 'soft', value: 0.625 },
  { key: 'default', value: 0.875 },
  { key: 'round', value: 1.25 },
  { key: 'pill', value: 1.5 },
] as const

export type RadiusPresetKey = (typeof RADIUS_PRESETS)[number]['key']

/** Grid preset → numeric config. Single source of truth for both the
 * appearance store (on preset selection) and the UI. */
export const GRID_PRESETS: Record<NonCustom<GridPreset>, Omit<GridConfig, 'preset'>> = {
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
 * Default --card colour (oklch without alpha) per theme, sourced from
 * src/styles/styles.css. Used by useApplyAppearance to inject cardOpacity.
 */
export const CARD_BASE: Record<ThemeMode, string> = {
  light: 'oklch(1 0 0)',
  dark: 'oklch(0.214 0.009 43.1)',
}

/**
 * Resolve the full palette (6 values) for the current scheme + theme. For
 * "custom", foregrounds are auto-computed from user-picked bg colours via
 * computeForeground; for presets, the baked-in foregrounds are returned.
 */
export function resolveColors(
  scheme: ColorSchemePreset,
  customColors: CustomColors,
  theme: ThemeMode,
): Palette {
  if (scheme === 'custom') {
    return withAutoForegrounds(customColors[theme])
  }
  return COLOR_PRESETS[scheme][theme]
}
