// Single source of truth for preset keys — used by the Zod schema, the
// appearance store, and the UI components to avoid drift.

export const COLOR_SCHEME_PRESETS = [
  'default',
  'ocean',
  'forest',
  'sunset',
  'lavender',
  'mono',
  'custom',
] as const
export type ColorSchemePreset = (typeof COLOR_SCHEME_PRESETS)[number]

export const GRID_PRESET_KEYS = ['compact', 'default', 'spacious', 'custom'] as const
export type GridPreset = (typeof GRID_PRESET_KEYS)[number]

export const FONT_FAMILIES = ['jetbrains', 'inter', 'system', 'plex'] as const
export type FontFamily = (typeof FONT_FAMILIES)[number]

export const THEME_COLOR_KEYS = ['primary', 'accent', 'muted'] as const
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]

export type ThemeColors = Record<ThemeColorKey, string>

export type CustomColors = {
  light: ThemeColors
  dark: ThemeColors
}

export type GridConfig = {
  preset: GridPreset
  columns: number
  rowHeight: number
  gap: number
}

export type AppearanceSettingsV1 = {
  version: 1
  colorScheme: ColorSchemePreset
  customColors: CustomColors
  radius: number
  cardOpacity: number
  font: FontFamily
  grid: GridConfig
}

export const APPEARANCE_SETTINGS_KEY = 'appearance-settings:v1'

export const DEFAULT_APPEARANCE: AppearanceSettingsV1 = {
  version: 1,
  colorScheme: 'default',
  customColors: {
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
  radius: 0.875,
  cardOpacity: 1.0,
  font: 'jetbrains',
  grid: {
    preset: 'default',
    columns: 12,
    rowHeight: 30,
    gap: 12,
  },
}
