// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createI18nModuleMock } from '@tests/mocks/i18n.ts'

vi.mock('react-i18next', () => createI18nModuleMock())

import { KpiLight, computeKpi } from '@/widgets/Productivity/components/KpiLight.tsx'
import type { BaselineStats, ProductivityDaily } from '@/widgets/Productivity/types.ts'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDay(overrides: Partial<ProductivityDaily> = {}): ProductivityDaily {
  return {
    date: '2024-01-15',
    closed: 5,
    fullFlow: 2,
    planned: 6,
    wip: 3,
    weekday: 0, // Monday
    ...overrides,
  }
}

function makeBaseline(overrides: Partial<BaselineStats> = {}): BaselineStats {
  return {
    closed: { weekdayMedian: 4, weekendMedian: 2 },
    fullFlow: { weekdayMedian: 2, weekendMedian: 1 },
    planned: { weekdayMedian: 5, weekendMedian: 3 },
    wip: { weekdayMedian: 3, weekendMedian: 1 },
    daysOfHistory: 14,
    weekdayDays: 10,
    weekendDays: 4,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computeKpi — pure function tests (no rendering needed)
// ---------------------------------------------------------------------------

describe('computeKpi', () => {
  it('coldStart=true → "cold" regardless of other inputs', () => {
    expect(computeKpi(makeDay(), makeBaseline(), true)).toBe('cold')
  })

  it('closed weekdayMedian is null → "cold"', () => {
    const baseline = makeBaseline({ closed: { weekdayMedian: null, weekendMedian: 2 } })
    expect(computeKpi(makeDay({ weekday: 0 }), baseline, false)).toBe('cold')
  })

  it('wip weekdayMedian is null → "cold"', () => {
    const baseline = makeBaseline({ wip: { weekdayMedian: null, weekendMedian: 1 } })
    expect(computeKpi(makeDay({ weekday: 0 }), baseline, false)).toBe('cold')
  })

  it('closed weekendMedian is null → "cold" on a weekend day', () => {
    const baseline = makeBaseline({ closed: { weekdayMedian: 4, weekendMedian: null } })
    expect(computeKpi(makeDay({ weekday: 6 }), baseline, false)).toBe('cold')
  })

  it('wip weekendMedian is null → "cold" on a weekend day', () => {
    const baseline = makeBaseline({ wip: { weekdayMedian: 3, weekendMedian: null } })
    expect(computeKpi(makeDay({ weekday: 5 }), baseline, false)).toBe('cold')
  })

  it('both conditions met → "green"', () => {
    // closed=5 >= closedMedian=4, wip=3 <= wipMedian(3)+1=4 → green
    const day = makeDay({ weekday: 1, closed: 5, wip: 3 })
    const baseline = makeBaseline({
      closed: { weekdayMedian: 4, weekendMedian: 99 },
      wip: { weekdayMedian: 3, weekendMedian: 99 },
    })
    expect(computeKpi(day, baseline, false)).toBe('green')
  })

  it('both conditions violated → "red"', () => {
    // closed=2 < closedMedian=4, wip=6 > wipMedian(3)+1=4 → red
    const day = makeDay({ weekday: 1, closed: 2, wip: 6 })
    const baseline = makeBaseline({
      closed: { weekdayMedian: 4, weekendMedian: 99 },
      wip: { weekdayMedian: 3, weekendMedian: 99 },
    })
    expect(computeKpi(day, baseline, false)).toBe('red')
  })

  it('bad closed only → "yellow"', () => {
    // closed=1 < closedMedian=4 (bad), wip=3 <= wipMedian(3)+1=4 (good) → yellow
    const day = makeDay({ weekday: 1, closed: 1, wip: 3 })
    const baseline = makeBaseline({
      closed: { weekdayMedian: 4, weekendMedian: 99 },
      wip: { weekdayMedian: 3, weekendMedian: 99 },
    })
    expect(computeKpi(day, baseline, false)).toBe('yellow')
  })

  it('bad wip only → "yellow"', () => {
    // closed=5 >= closedMedian=4 (good), wip=10 > wipMedian(3)+1=4 (bad) → yellow
    const day = makeDay({ weekday: 1, closed: 5, wip: 10 })
    const baseline = makeBaseline({
      closed: { weekdayMedian: 4, weekendMedian: 99 },
      wip: { weekdayMedian: 3, weekendMedian: 99 },
    })
    expect(computeKpi(day, baseline, false)).toBe('yellow')
  })

  it('weekend day (weekday=5) uses weekendMedian, not weekdayMedian', () => {
    // weekdayMedian=99 would give cold/red, weekendMedian=2 gives green
    const day = makeDay({ weekday: 5, closed: 3, wip: 1 })
    const baseline = makeBaseline({
      closed: { weekdayMedian: 99, weekendMedian: 2 },
      wip: { weekdayMedian: 99, weekendMedian: 1 },
    })
    // closed=3 >= weekendMedian(2) and wip=1 <= weekendMedian(1)+1=2 → green
    expect(computeKpi(day, baseline, false)).toBe('green')
  })

  it('weekend day (weekday=6) uses weekendMedian, not weekdayMedian', () => {
    // weekdayMedian=1 would give green, weekendMedian=10 would fail closed check
    const day = makeDay({ weekday: 6, closed: 3, wip: 1 })
    const baseline = makeBaseline({
      closed: { weekdayMedian: 1, weekendMedian: 10 },
      wip: { weekdayMedian: 99, weekendMedian: 1 },
    })
    // closed=3 < weekendMedian(10) (bad), wip=1 <= weekendMedian(1)+1=2 (good) → yellow
    expect(computeKpi(day, baseline, false)).toBe('yellow')
  })

  it('weekday (weekday=4) uses weekdayMedian, not weekendMedian', () => {
    // weekendMedian=99 would give red, weekdayMedian=4 gives green
    const day = makeDay({ weekday: 4, closed: 5, wip: 3 })
    const baseline = makeBaseline({
      closed: { weekdayMedian: 4, weekendMedian: 99 },
      wip: { weekdayMedian: 3, weekendMedian: 99 },
    })
    // closed=5 >= weekdayMedian(4) and wip=3 <= weekdayMedian(3)+1=4 → green
    expect(computeKpi(day, baseline, false)).toBe('green')
  })
})

// ---------------------------------------------------------------------------
// KpiLight component tests
// ---------------------------------------------------------------------------

describe('KpiLight', () => {
  it('renders the localized label for green status', () => {
    // coldStart=false, closed=5>=4, wip=3<=4 → green
    const day = makeDay({ weekday: 0, closed: 5, wip: 3 })
    const baseline = makeBaseline()
    render(<KpiLight today={day} baseline={baseline} coldStart={false} />)
    // Mock t() returns the key; expect "kpi.green"
    expect(screen.getByText('kpi.green')).toBeDefined()
  })

  it('green status → dot has bg-emerald-500 class', () => {
    const day = makeDay({ weekday: 0, closed: 5, wip: 3 })
    const baseline = makeBaseline()
    render(<KpiLight today={day} baseline={baseline} coldStart={false} />)
    const dot = screen.getByTestId('kpi-dot')
    expect(dot.className).toContain('bg-emerald-500')
  })

  it('renders the localized label for red status', () => {
    // closed=0<4 (bad), wip=10>4 (bad) → red
    const day = makeDay({ weekday: 0, closed: 0, wip: 10 })
    const baseline = makeBaseline()
    render(<KpiLight today={day} baseline={baseline} coldStart={false} />)
    expect(screen.getByText('kpi.red')).toBeDefined()
  })

  it('red status → dot has bg-rose-500 class', () => {
    const day = makeDay({ weekday: 0, closed: 0, wip: 10 })
    const baseline = makeBaseline()
    render(<KpiLight today={day} baseline={baseline} coldStart={false} />)
    const dot = screen.getByTestId('kpi-dot')
    expect(dot.className).toContain('bg-rose-500')
  })

  it('renders the localized label for cold status (coldStart=true)', () => {
    render(<KpiLight today={makeDay()} baseline={makeBaseline()} coldStart={true} />)
    expect(screen.getByText('kpi.cold')).toBeDefined()
  })

  it('cold status → dot has bg-zinc-400 class', () => {
    render(<KpiLight today={makeDay()} baseline={makeBaseline()} coldStart={true} />)
    const dot = screen.getByTestId('kpi-dot')
    expect(dot.className).toContain('bg-zinc-400')
  })

  it('dot is aria-hidden (decorative)', () => {
    render(<KpiLight today={makeDay()} baseline={makeBaseline()} coldStart={false} />)
    const dot = screen.getByTestId('kpi-dot')
    expect(dot.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders yellow status label and dot color', () => {
    // closed=1 < 4 (bad), wip=3 <= 4 (good) → yellow
    const day = makeDay({ weekday: 0, closed: 1, wip: 3 })
    const baseline = makeBaseline()
    render(<KpiLight today={day} baseline={baseline} coldStart={false} />)
    expect(screen.getByText('kpi.yellow')).toBeDefined()
    const dot = screen.getByTestId('kpi-dot')
    expect(dot.className).toContain('bg-amber-500')
  })
})
