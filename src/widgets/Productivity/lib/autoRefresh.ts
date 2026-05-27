import { debounce } from '@/utils/debounce.ts'
import { useProductivityStore } from '@/widgets/Productivity/store/useProductivityStore.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'

/**
 * Debounce подавляет всплески «100 апдейтов подряд», throttle поверх него
 * ограничивает реальную частоту тяжёлого пересчёта baseline + ensureTodayFresh.
 */
const DEBOUNCE_MS = 500
const THROTTLE_MS = 30_000

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
  let trailingTimerId: number | null = null

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
      trailingTimerId = window.setTimeout(() => {
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
      window.clearTimeout(trailingTimerId)
      trailingTimerId = null
    }
  }
}
