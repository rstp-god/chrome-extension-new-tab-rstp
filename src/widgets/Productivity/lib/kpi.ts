import type { BaselineStats, ProductivityDaily } from '@/widgets/Productivity/types.ts'

/** Тонкий допуск над baseline для WIP — позволяет не уйти в «красный» из-за +1 задачи. */
const WIP_TOLERANCE = 1

export type KpiStatus = 'green' | 'yellow' | 'red' | 'cold'

/**
 * Pure: считает статус «светофора» по сегодняшним метрикам и личному baseline.
 *
 * Логика и матрица оттенков описана в `src/widgets/Productivity/README.md`.
 * Если медианы недоступны (или `coldStart`), возвращает `'cold'`.
 */
export function computeKpi(
  today: ProductivityDaily,
  baseline: BaselineStats,
  coldStart: boolean,
  splitWeekdayWeekend: boolean,
): KpiStatus {
  if (coldStart) return 'cold'
  const useWeekendMedian = splitWeekdayWeekend && today.weekday >= 5
  const closedBaseline = useWeekendMedian
    ? baseline.closed.weekendMedian
    : baseline.closed.weekdayMedian
  const wipBaseline = useWeekendMedian ? baseline.wip.weekendMedian : baseline.wip.weekdayMedian
  if (closedBaseline === null || wipBaseline === null) return 'cold'
  const goodClosed = today.closed >= closedBaseline
  const goodWip = today.wip <= wipBaseline + WIP_TOLERANCE
  if (goodClosed && goodWip) return 'green'
  if (!goodClosed && !goodWip) return 'red'
  return 'yellow'
}
