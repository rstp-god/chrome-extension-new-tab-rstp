import { z } from 'zod'

import {
  ACTIVITY_LIMITS,
} from '@/background/activity/constants.ts'
import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'

/**
 * Zod schemas for the activity feature. Used by:
 *   - background/activity/storage.ts for envelope validation when reading
 *     from chrome.storage.local (invalid records are dropped, not thrown).
 *   - store/activity.ts (+ snapshot stores) via withChromeSync for the UI side.
 *
 * Hard caps on array / record sizes prevent a malformed envelope from stalling
 * the UI (imagine a forged record with 100k domain keys).
 */

/** 6-digit hex color, e.g. `#38A0D6`. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
/** OKLCH string: `oklch(L C H)` or `oklch(L C H / A)` with positive numeric components. */
const OKLCH_RE = /^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+(?:\s*\/\s*[\d.]+%?)?\s*\)$/

/** Soft cap on per-bucket domain count — real usage is well under this. */
const MAX_DOMAINS_PER_BUCKET = 500
/** Upper bound for the user-configurable `Top N` list in Screen Time. */
const MAX_USER_DOMAINS_CAP = 50

const activityEventTypeSchema = z.enum([
  'tab_activated',
  'tab_created',
  'tab_closed',
  'tab_navigated',
  'window_focus',
])

export const activityEventSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  domain: z.string(),
  tabId: z.number().int(),
  eventType: activityEventTypeSchema,
  duration: z.number().int().nonnegative().optional(),
})

/** Rejects prototype-pollution keys when used as object-record keys. */
const safeRecordKey = z
  .string()
  .refine((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype', {
    message: 'reserved key',
  })

const domainUsageSchema = z.object({
  totalTime: z.number().nonnegative(),
  visits: z.number().int().nonnegative(),
})

const tabMetricsSchema = z.object({
  created: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
  peakOpen: z.number().int().nonnegative(),
  avgLifetime: z.number().nonnegative(),
})

const boundedDomainRecord = z
  .record(safeRecordKey, domainUsageSchema)
  .refine((r) => Object.keys(r).length <= MAX_DOMAINS_PER_BUCKET, {
    message: `too many domains (> ${MAX_DOMAINS_PER_BUCKET})`,
  })

const activityBucketSchema = z.object({
  key: z.string(),
  domains: boundedDomainRecord,
  tabs: tabMetricsSchema,
})

export const activityDaySnapshotSchema = z.object({
  date: z.string(),
  // 24 hours + a small slack for corrupted writes.
  buckets: z.array(activityBucketSchema).max(24),
  totalsByDomain: boundedDomainRecord,
})

export const activityWeekSnapshotSchema = z.object({
  weekStart: z.string(),
  buckets: z.array(activityBucketSchema).max(ACTIVITY_LIMITS.weekMaxBuckets),
  totalsByDomain: boundedDomainRecord,
})

export const activityAllSnapshotSchema = z.object({
  // Worker caps at 90; allow a small slack so a rollover-in-flight envelope doesn't fail parse.
  buckets: z.array(activityBucketSchema).max(ACTIVITY_LIMITS.allMaxBuckets + 5),
})

export const activityRawSchema = z.array(activityEventSchema)

const hexColorSchema = z.string().regex(HEX_COLOR_RE, 'must be #rrggbb')
const oklchColorSchema = z.string().regex(OKLCH_RE, 'must be oklch(L C H [/ A])')

const chartPaletteSchema = z.object({
  baseHex: hexColorSchema,
  shades: z.tuple([
    oklchColorSchema,
    oklchColorSchema,
    oklchColorSchema,
    oklchColorSchema,
    oklchColorSchema,
  ]),
})

const screenTimeSettingsSchema = z.object({
  chartType: z.enum(['bar', 'area', 'donut']),
  showTopDomains: z.boolean(),
  showYAxis: z.boolean(),
  showGrid: z.boolean(),
  showTooltips: z.boolean(),
  maxDomains: z.number().int().positive().max(MAX_USER_DOMAINS_CAP),
})

const tabStatsSettingsSchema = z.object({
  visibleMetrics: z.object({
    openNow: z.boolean(),
    created: z.boolean(),
    closed: z.boolean(),
    avgLifetime: z.boolean(),
    activePct: z.boolean(),
    peakOpen: z.boolean(),
  }),
  format: z.enum(['cards', 'list', 'radial']),
  showSparkline: z.boolean(),
})

export const activitySettingsSchema = z.object({
  paused: z.boolean(),
  chartPalette: chartPaletteSchema,
  screenTime: screenTimeSettingsSchema,
  tabStats: tabStatsSettingsSchema,
})

export const activityRawEnvelope = makeEnvelopeSchema(activityRawSchema)
export const activityDayEnvelope = makeEnvelopeSchema(activityDaySnapshotSchema)
export const activityWeekEnvelope = makeEnvelopeSchema(activityWeekSnapshotSchema)
export const activityAllEnvelope = makeEnvelopeSchema(activityAllSnapshotSchema)
export const activitySettingsEnvelope = makeEnvelopeSchema(activitySettingsSchema)
