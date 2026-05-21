import { withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import { debounce } from '@/utils/debounce.ts'
import { computeBaseline } from '@/widgets/Productivity/lib/baseline.ts'
import { ensureTodayFresh, getDailyCache } from '@/widgets/Productivity/lib/dailyCache.ts'
import type { BaselineStats, ProductivityDaily } from '@/widgets/Productivity/types.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { z } from 'zod'
import { create } from 'zustand/react'

import type { Synced } from '@/services/chrome/zustandChromeSync.ts'

export const PRODUCTIVITY_SETTINGS_KEY = 'productivity-widget:v1'

const DEBOUNCE_MS = 500
const THROTTLE_MS = 30_000

type MetricVisibilityKey = 'showFullFlow' | 'showPlanned' | 'showWip'

interface ProductivityStore {
  // derived data (NOT persisted)
  today: ProductivityDaily | null
  baseline: BaselineStats | null
  isLoading: boolean
  error: string | null
  lastComputedAt: number | null
  // settings (persisted)
  showWip: boolean
  showFullFlow: boolean
  showPlanned: boolean
  splitWeekdayWeekend: boolean
  // actions
  refresh: () => Promise<void>
  setShowMetric: (key: MetricVisibilityKey, value: boolean) => void
  setSplitWeekdayWeekend: (value: boolean) => void
}

type ProductivityPersistedState = {
  version: 1
  showWip: boolean
  showFullFlow: boolean
  showPlanned: boolean
  splitWeekdayWeekend: boolean
}

const productivityStateSchema = z.object({
  version: z.literal(1),
  showWip: z.boolean(),
  showFullFlow: z.boolean(),
  showPlanned: z.boolean(),
  splitWeekdayWeekend: z.boolean(),
})

const productivityEnvelopeSchema = makeEnvelopeSchema(productivityStateSchema)

export const useProductivityStore = create<Synced<ProductivityStore>>()(
  withChromeSync<ProductivityStore, ProductivityPersistedState>({
    key: PRODUCTIVITY_SETTINGS_KEY,
    schema: productivityEnvelopeSchema,
    autoPersist: false,
    partialize: (s) => ({
      version: 1 as const,
      showWip: s.showWip,
      showFullFlow: s.showFullFlow,
      showPlanned: s.showPlanned,
      splitWeekdayWeekend: s.splitWeekdayWeekend,
    }),
    merge: (_cur, incoming) => ({
      showWip: incoming.showWip,
      showFullFlow: incoming.showFullFlow,
      showPlanned: incoming.showPlanned,
      splitWeekdayWeekend: incoming.splitWeekdayWeekend,
    }),
  })((set) => {
    // Serializes concurrent refresh() calls: each call is chained onto the
    // previous one so they never overlap. Both the fulfilled and rejected
    // handlers point at runRefresh so a prior rejection doesn't stall the chain.
    let refreshChain: Promise<void> = Promise.resolve()

    const runRefresh = async () => {
      set({ isLoading: true, error: null })
      try {
        // Read tasks fresh at the moment this run actually executes, so a
        // second queued call picks up the latest task list, not a stale capture.
        const tasks = useTodoStore.getState().tasks
        const today = await ensureTodayFresh(tasks)
        const cache = await getDailyCache()
        const baseline = computeBaseline(cache, new Date())
        set({ today, baseline, isLoading: false, lastComputedAt: Date.now() })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        set({ isLoading: false, error: message })
        // Never re-throw: keeps the chain alive and matches the public contract
        // that refresh() resolves (never rejects).
      }
    }

    return {
      // derived data
      today: null,
      baseline: null,
      isLoading: false,
      error: null,
      lastComputedAt: null,
      // settings
      showWip: true,
      showFullFlow: true,
      showPlanned: true,
      splitWeekdayWeekend: true,

      refresh: () => {
        refreshChain = refreshChain.then(runRefresh, runRefresh)
        return refreshChain
      },

      setShowMetric: (key, value) => {
        set({ [key]: value })
        void useProductivityStore.getState().commit()
      },

      setSplitWeekdayWeekend: (value) => {
        set({ splitWeekdayWeekend: value })
        void useProductivityStore.getState().commit()
      },
    }
  }),
)

/**
 * Set up the Todo-store subscription that drives automatic refreshes of the
 * Productivity widget. Must be called on widget mount and the returned cleanup
 * called on unmount.
 *
 * Each invocation is fully independent (no shared module-level mutable state),
 * so double-invoking under React StrictMode or across widget remounts is safe.
 *
 * Throttle behaviour (trailing-edge):
 * - Leading edge: if outside the THROTTLE_MS window, refresh immediately.
 * - Trailing edge: if inside the window, schedule ONE deferred refresh to run
 *   when the window expires. If a trailing timer is already pending, additional
 *   updates within the same window are ignored (no runaway queuing).
 */
export function startProductivityAutoRefresh(): () => void {
  let trailingTimerId: ReturnType<typeof setTimeout> | null = null

  const debouncedRefresh = debounce(() => {
    const { lastComputedAt } = useProductivityStore.getState()
    const elapsed = lastComputedAt !== null ? Date.now() - lastComputedAt : Infinity

    if (elapsed >= THROTTLE_MS) {
      // Leading edge: outside the window — refresh immediately.
      void useProductivityStore.getState().refresh()
    } else {
      // Trailing edge: inside the window — schedule a single deferred refresh
      // for when the window expires. Do not stack multiple trailing timers.
      if (trailingTimerId !== null) return
      const remaining = THROTTLE_MS - elapsed
      trailingTimerId = setTimeout(() => {
        trailingTimerId = null
        void useProductivityStore.getState().refresh()
      }, remaining)
    }
  }, DEBOUNCE_MS)

  const unsubscribe = useTodoStore.subscribe((state, prev) => {
    if (state.tasks !== prev.tasks) {
      debouncedRefresh()
    }
  })

  return () => {
    unsubscribe()
    debouncedRefresh.cancel()
    if (trailingTimerId !== null) {
      clearTimeout(trailingTimerId)
      trailingTimerId = null
    }
  }
}
