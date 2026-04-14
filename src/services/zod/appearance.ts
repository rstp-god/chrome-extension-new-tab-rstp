import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
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
  preset: z.union([
    z.literal('compact'),
    z.literal('default'),
    z.literal('spacious'),
    z.literal('custom'),
  ]),
  columns: z.number().int().min(6).max(24),
  rowHeight: z.number().min(20).max(60),
  gap: z.number().min(4).max(24),
})

export const appearanceStateSchema = z.object({
  version: z.literal(1),
  colorScheme: z.union([
    z.literal('default'),
    z.literal('ocean'),
    z.literal('forest'),
    z.literal('sunset'),
    z.literal('lavender'),
    z.literal('mono'),
    z.literal('custom'),
  ]),
  customColors: customColorsSchema,
  radius: z.number().min(0.25).max(1.5),
  cardOpacity: z.number().min(0.3).max(1.0),
  font: z.union([
    z.literal('jetbrains'),
    z.literal('inter'),
    z.literal('system'),
    z.literal('plex'),
  ]),
  grid: gridConfigSchema,
})

export const appearanceEnvelopeSchema = makeEnvelopeSchema(appearanceStateSchema)
