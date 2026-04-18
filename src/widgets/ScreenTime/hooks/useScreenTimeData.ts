import { useMemo } from 'react'

import type { ScreenTimePeriod } from '@/background/activity/types.ts'
import {
  useActivityAllStore,
  useActivityDayStore,
  useActivityWeekStore,
} from '@/store/activity.snapshots.ts'
import type {
  DomainTotal,
  ScreenTimeChartRow,
  ScreenTimeData,
} from '@/widgets/ScreenTime/types.ts'
import { OTHER_KEY } from '@/widgets/ScreenTime/types.ts'
import { slugifyDomain } from '@/widgets/ScreenTime/utils/domainSlug.ts'
import { pickSnapshot } from '@/widgets/ScreenTime/utils/snapshot.ts'

/**
 * Screen Time data selector. Reads the correct snapshot store by period,
 * sorts domains by time desc, produces top-N with slug + color index, and
 * emits recharts-ready rows with every top-domain column pre-filled to 0
 * (clean zero-baseline on sparse buckets).
 */
export function useScreenTimeData(
  period: ScreenTimePeriod,
  maxDomains: number,
): ScreenTimeData {
  const day = useActivityDayStore((s) => s.snapshot)
  const week = useActivityWeekStore((s) => s.snapshot)
  const all = useActivityAllStore((s) => s.snapshot)

  return useMemo(() => {
    const { buckets, totalsByDomain } = pickSnapshot(period, day, week, all)

    // Sort entries by totalTime desc; slice the first N for the top-domain set.
    const sortedEntries = Object.entries(totalsByDomain).sort(
      ([, a], [, b]) => b.totalTime - a.totalTime,
    )

    const topDomains: DomainTotal[] = sortedEntries
      .slice(0, maxDomains)
      .map(([domain, usage], i) => ({
        domain,
        slug: slugifyDomain(domain),
        totalTime: usage.totalTime,
        colorIndex: i,
      }))

    const topSlugByDomain = new Map(topDomains.map((d) => [d.domain, d.slug]))
    const totalSeconds = sortedEntries.reduce((acc, [, u]) => acc + u.totalTime, 0)
    const otherSeconds = sortedEntries
      .slice(maxDomains)
      .reduce((acc, [, u]) => acc + u.totalTime, 0)
    const hasOther = otherSeconds > 0

    const chartRows: ScreenTimeChartRow[] = buckets.map((b) => {
      const row: ScreenTimeChartRow = { key: b.key }
      // Pre-fill every known column with 0 so stacked Area/Bar render a clean
      // zero baseline where a domain is absent in this bucket.
      for (const td of topDomains) row[td.slug] = 0
      if (hasOther) row[OTHER_KEY] = 0

      for (const [domain, usage] of Object.entries(b.domains)) {
        const slug = topSlugByDomain.get(domain)
        if (slug) {
          row[slug] = usage.totalTime
        } else if (hasOther) {
          const prev = row[OTHER_KEY]
          row[OTHER_KEY] = (typeof prev === 'number' ? prev : 0) + usage.totalTime
        }
      }
      return row
    })

    return {
      totalSeconds,
      topDomains,
      otherSeconds,
      chartRows,
      isEmpty: totalSeconds === 0,
    }
  }, [period, maxDomains, day, week, all])
}
