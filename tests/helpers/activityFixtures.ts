import type { Page } from '@playwright/test'

import type {
  ActivityAllSnapshot,
  ActivityBucket,
  ActivityDaySnapshot,
  ActivitySettings,
  ActivityWeekSnapshot,
} from '@/background/activity/types.ts'

/**
 * Seed the extension's `chrome.storage.local` with pre-built activity
 * snapshots. The envelope format matches what the worker writes — the UI's
 * `withChromeSync` reads it on the next load.
 *
 * Call this AFTER `openExtensionNewTab` (so `chrome.storage.local` exists)
 * then reload so the store picks the fixture up on mount.
 */

interface ActivityFixtures {
  day?: ActivityDaySnapshot | null
  week?: ActivityWeekSnapshot | null
  all?: ActivityAllSnapshot | null
  settings?: Partial<ActivitySettings>
}

function envelope<T>(state: T): { meta: { originId: string; rev: number; ts: number }; state: T } {
  return { meta: { originId: 'e2e-fixture', rev: 1, ts: 0 }, state }
}

export async function seedActivityStorage(page: Page, fixtures: ActivityFixtures) {
  const payload = {
    day: fixtures.day ? envelope(fixtures.day) : undefined,
    week: fixtures.week ? envelope(fixtures.week) : undefined,
    all: fixtures.all ? envelope(fixtures.all) : undefined,
    settings: fixtures.settings ? envelope(fixtures.settings) : undefined,
  }
  await page.evaluate(
    (p) =>
      new Promise<void>((resolve, reject) => {
        const items: Record<string, unknown> = {}
        if (p.day) items.activity_day = p.day
        if (p.week) items.activity_week = p.week
        if (p.all) items.activity_all = p.all
        if (p.settings) items.activity_settings = p.settings
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else {
            resolve()
          }
        })
      }),
    payload,
  )
}

/** Stock day snapshot: 3 domains, 2 hourly buckets (10:00 + 14:00). */
export function buildDayFixture(date: string): ActivityDaySnapshot {
  const buckets: ActivityBucket[] = [
    {
      key: '10',
      domains: {
        'github.com': { totalTime: 1800, visits: 3 },
        'youtube.com': { totalTime: 900, visits: 2 },
      },
      tabs: { created: 6, closed: 3, peakOpen: 18, avgLifetime: 1200 },
    },
    {
      key: '14',
      domains: {
        'github.com': { totalTime: 600, visits: 1 },
        'youtube.com': { totalTime: 2100, visits: 4 },
        'chatgpt.com': { totalTime: 1500, visits: 3 },
      },
      tabs: { created: 5, closed: 4, peakOpen: 22, avgLifetime: 3600 },
    },
  ]
  const totalsByDomain: Record<string, { totalTime: number; visits: number }> = {}
  for (const b of buckets) {
    for (const [d, u] of Object.entries(b.domains)) {
      const prev = totalsByDomain[d]
      if (prev) {
        prev.totalTime += u.totalTime
        prev.visits += u.visits
      } else {
        totalsByDomain[d] = { totalTime: u.totalTime, visits: u.visits }
      }
    }
  }
  return { date, buckets, totalsByDomain }
}

/** Week snapshot with 7 daily buckets — ascending peakOpen trend for a clear sparkline. */
export function buildWeekFixture(weekStart: string): ActivityWeekSnapshot {
  const peaks = [12, 18, 15, 22, 25, 28, 20]
  const buckets: ActivityBucket[] = peaks.map((peak, i) => {
    const day = String(13 + i).padStart(2, '0')
    return {
      key: `2024-01-${day}`,
      domains: {
        'github.com': { totalTime: 900 + i * 100, visits: 2 + i },
        'youtube.com': { totalTime: 600 + i * 150, visits: 3 },
      },
      tabs: { created: 10 + i, closed: 8 + i, peakOpen: peak, avgLifetime: 2400 },
    }
  })
  return { weekStart, buckets, totalsByDomain: {} }
}

/** All-snapshot with yesterday + today buckets (delta math). */
export function buildAllFixture(todayDate: string, yesterdayDate: string): ActivityAllSnapshot {
  return {
    buckets: [
      {
        key: yesterdayDate,
        domains: { 'github.com': { totalTime: 2000, visits: 5 } },
        tabs: { created: 8, closed: 6, peakOpen: 15, avgLifetime: 3000 },
      },
      {
        key: todayDate,
        domains: { 'github.com': { totalTime: 2400, visits: 4 } },
        tabs: { created: 11, closed: 7, peakOpen: 22, avgLifetime: 3400 },
      },
    ],
  }
}
