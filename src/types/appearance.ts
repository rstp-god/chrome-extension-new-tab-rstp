export type ColorSchemePreset =
  | 'default'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'lavender'
  | 'mono'
  | 'custom'

export type ThemeColors = {
  primary: string
  accent: string
  muted: string
}

export type CustomColors = {
  light: ThemeColors
  dark: ThemeColors
}

export type GridPreset = 'compact' | 'default' | 'spacious' | 'custom'

export type GridConfig = {
  preset: GridPreset
  columns: number
  rowHeight: number
  gap: number
}

export type FontFamily = 'jetbrains' | 'inter' | 'system' | 'plex'

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
