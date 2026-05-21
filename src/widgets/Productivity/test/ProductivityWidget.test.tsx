// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nModuleMock } from '@tests/mocks/i18n.ts'

vi.mock('react-i18next', () => createI18nModuleMock())

import { setLocal } from '@/services/chrome/storage.ts'
import { PRODUCTIVITY_DAILY_KEY } from '@/widgets/Productivity/lib/dailyCache.ts'
import { ProductivityWidget } from '@/widgets/Productivity/ProductivityWidget.tsx'
import {
  PRODUCTIVITY_SETTINGS_KEY,
  useProductivityStore,
} from '@/widgets/Productivity/store/useProductivityStore.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import type { BaselineStats, ProductivityDaily } from '@/widgets/Productivity/types.ts'
import { TestId } from '@tests/constants/testIds.ts'

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
    weekday: 0, // Monday (weekday)
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
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Reset store state to defaults (fresh each test)
  useProductivityStore.setState({
    today: null,
    baseline: null,
    isLoading: false,
    error: null,
    lastComputedAt: null,
    showWip: true,
    showFullFlow: true,
    showPlanned: true,
    splitWeekdayWeekend: true,
    // Replace refresh with a no-op so the useEffect on mount does not
    // trigger real async work that could interfere with state-driven assertions.
    refresh: vi.fn().mockResolvedValue(undefined),
  } as Partial<ReturnType<typeof useProductivityStore.getState>>)

  // Reset Todo store
  useTodoStore.setState({ tasks: [], integration: null, loading: false, errorKey: null })

  // Reset in-memory storage
  await setLocal(PRODUCTIVITY_DAILY_KEY, {})
  await setLocal(PRODUCTIVITY_SETTINGS_KEY, null)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProductivityWidget — loaded state', () => {
  it('renders the widget title, 4 metric numbers, and the KPI light', () => {
    const today = makeDay()
    const baseline = makeBaseline()

    useProductivityStore.setState({ today, baseline })

    render(<ProductivityWidget />)

    // Title (mock t() returns the key)
    expect(screen.getByText('title')).toBeDefined()

    // KPI light dot
    expect(screen.getByTestId(TestId.ProductivityKpiDot)).toBeDefined()

    // 4 metric labels (mock t() returns keys)
    expect(screen.getByText('metrics.closed')).toBeDefined()
    expect(screen.getByText('metrics.fullFlow')).toBeDefined()
    expect(screen.getByText('metrics.planned')).toBeDefined()
    expect(screen.getByText('metrics.wip')).toBeDefined()

    // The actual numeric values
    expect(screen.getByText('5')).toBeDefined() // closed
    expect(screen.getByText('2')).toBeDefined() // fullFlow
    expect(screen.getByText('6')).toBeDefined() // planned
    expect(screen.getByText('3')).toBeDefined() // wip
  })
})

describe('ProductivityWidget — coldStart', () => {
  it('shows cold-start delta elements when daysOfHistory < 7', () => {
    const today = makeDay({ weekday: 1 })
    const baseline = makeBaseline({ daysOfHistory: 3 }) // < 7 → coldStart=true

    useProductivityStore.setState({ today, baseline })

    render(<ProductivityWidget />)

    const coldStartEls = screen.getAllByTestId(TestId.ProductivityDeltaColdStart)
    // All visible metric cells should show cold-start
    expect(coldStartEls.length).toBeGreaterThan(0)
    expect(coldStartEls[0].textContent).toBe('coldStart')
  })

  it('shows cold-start when weekdayDays < 3 (splitWeekdayWeekend ON, weekday)', () => {
    const today = makeDay({ weekday: 2 }) // Wednesday = weekday
    const baseline = makeBaseline({
      daysOfHistory: 10,
      weekdayDays: 2, // < 3 → coldStart=true
    })

    useProductivityStore.setState({ today, baseline, splitWeekdayWeekend: true })

    render(<ProductivityWidget />)

    const coldStartEls = screen.getAllByTestId(TestId.ProductivityDeltaColdStart)
    expect(coldStartEls.length).toBeGreaterThan(0)
  })

  it('KPI dot is bg-zinc-400 (cold status) when coldStart=true', () => {
    const today = makeDay()
    const baseline = makeBaseline({ daysOfHistory: 2 }) // triggers coldStart

    useProductivityStore.setState({ today, baseline })

    render(<ProductivityWidget />)

    const dot = screen.getByTestId(TestId.ProductivityKpiDot)
    expect(dot.className).toContain('bg-zinc-400')
  })
})

describe('ProductivityWidget — metric visibility', () => {
  it('showWip=false renders only 3 metric cells (closed, fullFlow, planned)', () => {
    useProductivityStore.setState({
      today: makeDay(),
      baseline: makeBaseline(),
      showWip: false,
    })

    render(<ProductivityWidget />)

    expect(screen.getByText('metrics.closed')).toBeDefined()
    expect(screen.getByText('metrics.fullFlow')).toBeDefined()
    expect(screen.getByText('metrics.planned')).toBeDefined()
    expect(screen.queryByText('metrics.wip')).toBeNull()
  })

  it('showFullFlow=false hides fullFlow cell', () => {
    useProductivityStore.setState({
      today: makeDay(),
      baseline: makeBaseline(),
      showFullFlow: false,
    })

    render(<ProductivityWidget />)

    expect(screen.queryByText('metrics.fullFlow')).toBeNull()
    expect(screen.getByText('metrics.closed')).toBeDefined()
  })

  it('showPlanned=false hides planned cell', () => {
    useProductivityStore.setState({
      today: makeDay(),
      baseline: makeBaseline(),
      showPlanned: false,
    })

    render(<ProductivityWidget />)

    expect(screen.queryByText('metrics.planned')).toBeNull()
    expect(screen.getByText('metrics.closed')).toBeDefined()
  })
})

describe('ProductivityWidget — loading state', () => {
  it('shows skeleton when today is null and no error', () => {
    // today and baseline are null by default after beforeEach
    render(<ProductivityWidget />)

    expect(screen.getByTestId(TestId.ProductivityWidgetSkeleton)).toBeDefined()
    // Metric grid should NOT be present
    expect(screen.queryByTestId(TestId.ProductivityMetricsGrid)).toBeNull()
  })

  it('shows skeleton when baseline is null even if today is set', () => {
    useProductivityStore.setState({ today: makeDay(), baseline: null })

    render(<ProductivityWidget />)

    expect(screen.getByTestId(TestId.ProductivityWidgetSkeleton)).toBeDefined()
  })

  it('does not show skeleton once data is loaded (background refresh does not flash)', () => {
    // Data is populated — even if isLoading is true (background refresh), show data
    useProductivityStore.setState({
      today: makeDay(),
      baseline: makeBaseline(),
      isLoading: true, // background refresh in progress
    })

    render(<ProductivityWidget />)

    expect(screen.queryByTestId(TestId.ProductivityWidgetSkeleton)).toBeNull()
    expect(screen.getByTestId(TestId.ProductivityWidget)).toBeDefined()
  })
})

describe('ProductivityWidget — error state', () => {
  it('renders the error message and a retry button when error is non-null', () => {
    useProductivityStore.setState({ error: 'Something went wrong' })

    render(<ProductivityWidget />)

    // t('error.message') returns the key
    expect(screen.getByText('error.message')).toBeDefined()
    expect(screen.getByRole('button', { name: 'error.retry' })).toBeDefined()
  })

  it('clicking retry calls refresh()', () => {
    const refreshMock = vi.fn().mockResolvedValue(undefined)
    useProductivityStore.setState({
      error: 'Storage failure',
      refresh: refreshMock,
    } as Partial<ReturnType<typeof useProductivityStore.getState>>)

    render(<ProductivityWidget />)

    const retryButton = screen.getByRole('button', { name: 'error.retry' })
    fireEvent.click(retryButton)

    // refresh should have been called: once from useEffect on mount, once from click
    expect(refreshMock).toHaveBeenCalledTimes(2)
  })
})
