import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import { COLOR_SCHEME_PRESETS, FONT_FAMILIES, GRID_PRESET_KEYS } from '@/types/appearance.ts'
import { z } from 'zod'

const themeColorsSchema = z.object({
  primary: z.string(),
  accent: z.string(),
  muted: z.string(),
})

const customColorsSchema = z.object({
  light: themeColorsSchema,
  dark: themeColorsSchema,
})

const gridConfigSchema = z.object({
  preset: z.enum(GRID_PRESET_KEYS),
  columns: z.number().int().min(6).max(24),
  rowHeight: z.number().min(20).max(60),
  gap: z.number().min(4).max(24),
})

export const appearanceStateSchema = z.object({
  version: z.literal(1),
  colorScheme: z.enum(COLOR_SCHEME_PRESETS),
  customColors: customColorsSchema,
  radius: z.number().min(0.25).max(1.5),
  cardOpacity: z.number().min(0.3).max(1.0),
  font: z.enum(FONT_FAMILIES),
  grid: gridConfigSchema,
})

export const appearanceEnvelopeSchema = makeEnvelopeSchema(appearanceStateSchema)
