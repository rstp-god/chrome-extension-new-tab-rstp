// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nModuleMock } from '@tests/mocks/i18n.ts'

vi.mock('react-i18next', () => createI18nModuleMock())

// Mock dailyCache before importing the component so the spy is in place.
vi.mock('@/widgets/Productivity/lib/dailyCache.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/widgets/Productivity/lib/dailyCache.ts')>()
  return {
    ...actual,
    rebuildDailyCache: vi.fn().mockResolvedValue({}),
  }
})

import { setLocal } from '@/services/chrome/storage.ts'
import { PRODUCTIVITY_DAILY_KEY, rebuildDailyCache } from '@/widgets/Productivity/lib/dailyCache.ts'
import { ProductivitySettings } from '@/widgets/Productivity/components/ProductivitySettings.tsx'
import {
  PRODUCTIVITY_SETTINGS_KEY,
  useProductivityStore,
} from '@/widgets/Productivity/store/useProductivityStore.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Reset store state to defaults
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
  })

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
// Helper: open the Sheet
// ---------------------------------------------------------------------------

async function openSheet() {
  const user = userEvent.setup()
  // The trigger button aria-label key is returned as-is by the mock t()
  const trigger = screen.getByRole('button', { name: 'settings.openLabel' })
  await user.click(trigger)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProductivitySettings — Sheet trigger', () => {
  it('renders the trigger button with a settings icon', () => {
    render(<ProductivitySettings />)
    const trigger = screen.getByRole('button', { name: 'settings.openLabel' })
    expect(trigger).toBeDefined()
  })

  it('opens the Sheet and shows all four switch rows', async () => {
    render(<ProductivitySettings />)
    await openSheet()

    // All four labels (mock t() returns the key)
    expect(screen.getByText('settings.showFullFlow')).toBeDefined()
    expect(screen.getByText('settings.showPlanned')).toBeDefined()
    expect(screen.getByText('settings.showWip')).toBeDefined()
    expect(screen.getByText('settings.splitWeekdayWeekend')).toBeDefined()

    // All four switches via their htmlFor ids
    expect(document.getElementById('productivity-show-full-flow')).not.toBeNull()
    expect(document.getElementById('productivity-show-planned')).not.toBeNull()
    expect(document.getElementById('productivity-show-wip')).not.toBeNull()
    expect(document.getElementById('productivity-split-weekday-weekend')).not.toBeNull()
  })
})

describe('ProductivitySettings — toggle switches', () => {
  it('toggling "Show WIP" switch calls setShowMetric and flips store.showWip', async () => {
    render(<ProductivitySettings />)
    await openSheet()

    expect(useProductivityStore.getState().showWip).toBe(true)

    const wipSwitch = document.getElementById('productivity-show-wip') as HTMLButtonElement
    expect(wipSwitch).not.toBeNull()

    fireEvent.click(wipSwitch)

    expect(useProductivityStore.getState().showWip).toBe(false)
  })

  it('toggling "Show Full Flow" switch flips store.showFullFlow', async () => {
    render(<ProductivitySettings />)
    await openSheet()

    expect(useProductivityStore.getState().showFullFlow).toBe(true)

    const fullFlowSwitch = document.getElementById(
      'productivity-show-full-flow',
    ) as HTMLButtonElement
    fireEvent.click(fullFlowSwitch)

    expect(useProductivityStore.getState().showFullFlow).toBe(false)
  })

  it('toggling "Show Planned" switch flips store.showPlanned', async () => {
    render(<ProductivitySettings />)
    await openSheet()

    expect(useProductivityStore.getState().showPlanned).toBe(true)

    const plannedSwitch = document.getElementById('productivity-show-planned') as HTMLButtonElement
    fireEvent.click(plannedSwitch)

    expect(useProductivityStore.getState().showPlanned).toBe(false)
  })

  it('toggling "Split weekday/weekend" switch flips store.splitWeekdayWeekend', async () => {
    render(<ProductivitySettings />)
    await openSheet()

    expect(useProductivityStore.getState().splitWeekdayWeekend).toBe(true)

    const splitSwitch = document.getElementById(
      'productivity-split-weekday-weekend',
    ) as HTMLButtonElement
    fireEvent.click(splitSwitch)

    expect(useProductivityStore.getState().splitWeekdayWeekend).toBe(false)
  })
})

describe('ProductivitySettings — rebuild history', () => {
  it('clicking "Rebuild history" calls rebuildDailyCache with current tasks and then refresh()', async () => {
    const mockTask = {
      id: 'task-1',
      title: 'Test task',
      description: null,
      status: 'completed' as const,
      projectId: null,
      createdAt: Date.now(),
      statusChangedAt: Date.now(),
      completedAt: Date.now(),
      deletedAt: null,
      linkedTab: null,
      remoteRef: null,
      syncState: 'clean' as const,
    }
    useTodoStore.setState({ tasks: [mockTask] })

    const refreshSpy = vi.fn().mockResolvedValue(undefined)
    useProductivityStore.setState({ refresh: refreshSpy } as Partial<
      ReturnType<typeof useProductivityStore.getState>
    >)

    render(<ProductivitySettings />)
    await openSheet()

    const rebuildButton = screen.getByRole('button', { name: 'settings.rebuildHistory' })
    expect(rebuildButton).toBeDefined()

    const user = userEvent.setup()
    await user.click(rebuildButton)

    await waitFor(() => {
      expect(rebuildDailyCache).toHaveBeenCalledWith([mockTask])
    })

    expect(refreshSpy).toHaveBeenCalledTimes(1)
  })

  it('rebuild button is disabled while rebuilding to prevent concurrent calls', async () => {
    // Make rebuildDailyCache hang briefly so we can observe the disabled state
    let resolveRebuild!: () => void
    const hangingRebuild = new Promise<Record<string, never>>((resolve) => {
      resolveRebuild = () => resolve({})
    })
    vi.mocked(rebuildDailyCache).mockReturnValueOnce(
      hangingRebuild as ReturnType<typeof rebuildDailyCache>,
    )

    useProductivityStore.setState({ refresh: vi.fn().mockResolvedValue(undefined) } as Partial<
      ReturnType<typeof useProductivityStore.getState>
    >)

    render(<ProductivitySettings />)
    await openSheet()

    const rebuildButton = screen.getByRole('button', { name: 'settings.rebuildHistory' })

    // Click once — should become disabled immediately
    fireEvent.click(rebuildButton)

    await waitFor(() => {
      expect((rebuildButton as HTMLButtonElement).disabled).toBe(true)
    })

    // Resolve the hanging rebuild so cleanup doesn't hang
    resolveRebuild()
  })
})
