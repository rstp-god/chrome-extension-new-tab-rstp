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
  })((set, get) => {
    // Set up debounced refresh driven by Todo store subscription.
    // The callback references useProductivityStore.getState() which is fine
    // because callbacks run asynchronously after the store binding exists.
    const debouncedRefresh = debounce(() => {
      const { lastComputedAt } = useProductivityStore.getState()
      if (lastComputedAt !== null && Date.now() - lastComputedAt < THROTTLE_MS) {
        return
      }
      void useProductivityStore.getState().refresh()
    }, DEBOUNCE_MS)

    useTodoStore.subscribe((state, prev) => {
      if (state.tasks !== prev.tasks) {
        debouncedRefresh()
      }
    })

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

      refresh: async () => {
        set({ isLoading: true, error: null })
        try {
          const tasks = useTodoStore.getState().tasks
          const today = await ensureTodayFresh(tasks)
          const cache = await getDailyCache()
          const baseline = computeBaseline(cache, new Date())
          set({ today, baseline, isLoading: false, lastComputedAt: Date.now() })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          set({ isLoading: false, error: message })
        }
      },

      setShowMetric: (key, value) => {
        set({ [key]: value })
        void get().commit()
      },

      setSplitWeekdayWeekend: (value) => {
        set({ splitWeekdayWeekend: value })
        void get().commit()
      },
    }
  }),
)
