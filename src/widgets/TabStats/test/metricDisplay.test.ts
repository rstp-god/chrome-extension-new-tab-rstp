import { describe, expect, it } from 'vitest'

import type { TabStatsMetricKey } from '@/background/activity/types.ts'
import type { TabStatsData } from '@/widgets/TabStats/types.ts'
import { activePct, getMetricDisplay } from '@/widgets/TabStats/utils/metricDisplay.ts'

// Stub i18n `t` — returns the key + a simple interpolation tag so assertions
// can check structure without caring about translations.
const t = ((key: string, params?: Record<string, unknown>) => {
  if (!params) return key
  return `${key}:${Object.entries(params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(',')}`
}) as unknown as Parameters<typeof getMetricDisplay>[2]

const BASE_DATA: TabStatsData = {
  openNow: 10,
  discardedNow: 2,
  today: { created: 5, closed: 3, peakOpen: 12, avgLifetime: 7200 },
  deltas: { createdDelta: 2, closedDelta: -1 },
  sparkline: null,
  isEmpty: false,
}

describe('activePct', () => {
  it('returns 0 when no tabs open', () => {
    expect(activePct({ ...BASE_DATA, openNow: 0, discardedNow: 0 })).toBe(0)
  })
  it('computes (open - discarded) / open * 100', () => {
    expect(activePct({ ...BASE_DATA, openNow: 10, discardedNow: 2 })).toBe(80)
    expect(activePct({ ...BASE_DATA, openNow: 4, discardedNow: 1 })).toBe(75)
  })
})

describe('getMetricDisplay', () => {
  const cases: TabStatsMetricKey[] = [
    'openNow',
    'created',
    'closed',
    'avgLifetime',
    'activePct',
    'peakOpen',
  ]

  it.each(cases)('returns a populated display for %s', (key) => {
    const m = getMetricDisplay(key, BASE_DATA, t)
    expect(m.key).toBe(key)
    expect(typeof m.value).toBe('string')
    expect(m.value.length).toBeGreaterThan(0)
  })

  it('openNow value matches openNow count', () => {
    expect(getMetricDisplay('openNow', BASE_DATA, t).value).toBe('10')
  })

  it('activePct formats as percent', () => {
    expect(getMetricDisplay('activePct', BASE_DATA, t).value).toBe('80%')
  })

  it('avgLifetime uses fractional hours for < 10h and integer for ≥ 10h', () => {
    const fractional = getMetricDisplay(
      'avgLifetime',
      { ...BASE_DATA, today: { ...BASE_DATA.today, avgLifetime: 9000 } }, // 2.5h
      t,
    )
    expect(fractional.value).toContain('2.5')
    const intHours = getMetricDisplay(
      'avgLifetime',
      { ...BASE_DATA, today: { ...BASE_DATA.today, avgLifetime: 50 * 3600 } },
      t,
    )
    expect(intHours.value).toContain('50')
  })

  it('avgLifetime shows 0 when no tabs closed', () => {
    const m = getMetricDisplay(
      'avgLifetime',
      { ...BASE_DATA, today: { ...BASE_DATA.today, avgLifetime: 0 } },
      t,
    )
    expect(m.value).toContain('0')
  })
})
