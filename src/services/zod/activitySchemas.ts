import { z } from 'zod'

import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'

/**
 * Zod schemas for the activity feature. Used by:
 *   - background/activity/storage.ts for envelope validation when reading
 *     from chrome.storage.local (invalid records are dropped, not thrown).
 *   - store/activity.ts (+ snapshot stores) via withChromeSync for the UI side.
 */

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
const safeRecordKey = z.string().refine((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype', {
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

const activityBucketSchema = z.object({
  key: z.string(),
  domains: z.record(safeRecordKey, domainUsageSchema),
  tabs: tabMetricsSchema,
})

export const activityDaySnapshotSchema = z.object({
  date: z.string(),
  buckets: z.array(activityBucketSchema),
  totalsByDomain: z.record(safeRecordKey, domainUsageSchema),
})

export const activityWeekSnapshotSchema = z.object({
  weekStart: z.string(),
  buckets: z.array(activityBucketSchema),
  totalsByDomain: z.record(safeRecordKey, domainUsageSchema),
})

export const activityAllSnapshotSchema = z.object({
  buckets: z.array(activityBucketSchema),
})

export const activityRawSchema = z.array(activityEventSchema)

const chartPaletteSchema = z.object({
  baseHex: z.string(),
  shades: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
})

const screenTimeSettingsSchema = z.object({
  chartType: z.enum(['bar', 'area', 'donut']),
  showTopDomains: z.boolean(),
  showYAxis: z.boolean(),
  showGrid: z.boolean(),
  showTooltips: z.boolean(),
  maxDomains: z.number().int().positive(),
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
