/**
 * Mock fixtures for Productivity widget scenario tests and showcase.
 *
 * All dates are relative to the fixed test date 2024-01-15 (Monday, UTC).
 * That is the date pinned by `installDeterministicPageState` in extension.ts.
 *
 * The `productivity_daily` chrome.storage key holds a raw
 * `Record<string, ProductivityDaily>` (NOT an envelope); seed it directly.
 *
 * The baseline window covers the 14 calendar days *before* today
 * (2024-01-01 through 2024-01-14). Today's metrics are computed live from
 * the Todo task list seeded via the `todo-widget:v1` envelope.
 *
 * Day-of-week mapping for the 14-day window (Mon=0 … Sun=6):
 *   Jan 14 Sun → weekday=6 (WEEKEND)   Jan 13 Sat → weekday=5 (WEEKEND)
 *   Jan 12 Fri → weekday=4             Jan 11 Thu → weekday=3
 *   Jan 10 Wed → weekday=2             Jan 09 Tue → weekday=1
 *   Jan 08 Mon → weekday=0             Jan 07 Sun → weekday=6 (WEEKEND)
 *   Jan 06 Sat → weekday=5 (WEEKEND)   Jan 05 Fri → weekday=4
 *   Jan 04 Thu → weekday=3             Jan 03 Wed → weekday=2
 *   Jan 02 Tue → weekday=1             Jan 01 Mon → weekday=0
 *
 * → 10 weekday days, 4 weekend days.
 * Weekday entries: closed=5, wip=10  → weekday median closed=5, wip=10
 * Weekend entries: closed=2, wip=6   → weekend median closed=2, wip=6
 */

import type { ProductivityDaily } from '@/widgets/Productivity/types.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'

// ---------------------------------------------------------------------------
// Shared 14-day baseline history
// ---------------------------------------------------------------------------

/**
 * Daily-cache record with 14 entries covering the full baseline window.
 * Seed this into `productivity_daily` in chrome.storage for a warmed baseline.
 */
export const BASELINE_CACHE: Record<string, ProductivityDaily> = {
  '2024-01-01': { date: '2024-01-01', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 0 },
  '2024-01-02': { date: '2024-01-02', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 1 },
  '2024-01-03': { date: '2024-01-03', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 2 },
  '2024-01-04': { date: '2024-01-04', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 3 },
  '2024-01-05': { date: '2024-01-05', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 4 },
  '2024-01-06': { date: '2024-01-06', closed: 2, fullFlow: 1, planned: 2, wip: 6, weekday: 5 },
  '2024-01-07': { date: '2024-01-07', closed: 2, fullFlow: 1, planned: 2, wip: 6, weekday: 6 },
  '2024-01-08': { date: '2024-01-08', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 0 },
  '2024-01-09': { date: '2024-01-09', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 1 },
  '2024-01-10': { date: '2024-01-10', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 2 },
  '2024-01-11': { date: '2024-01-11', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 3 },
  '2024-01-12': { date: '2024-01-12', closed: 5, fullFlow: 2, planned: 4, wip: 10, weekday: 4 },
  '2024-01-13': { date: '2024-01-13', closed: 2, fullFlow: 1, planned: 2, wip: 6, weekday: 5 },
  '2024-01-14': { date: '2024-01-14', closed: 2, fullFlow: 1, planned: 2, wip: 6, weekday: 6 },
}

// ---------------------------------------------------------------------------
// Timestamp constants for 2024-01-15 (fixed test date)
// ---------------------------------------------------------------------------

/** Epoch ms for 2024-01-15T00:00:00Z (UTC midnight). */
export const JAN15_START_MS = 1_705_276_800_000
/** Epoch ms for 2024-01-15T09:00:00Z — matches FIXED_TIME_ISO. */
export const JAN15_9AM_MS = 1_705_309_200_000

function makeTask(
  id: string,
  status: TodoTask['status'],
  createdAt: number,
  completedAt: number | null = null,
): TodoTask {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status,
    projectId: null,
    createdAt,
    statusChangedAt: completedAt ?? createdAt,
    completedAt,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
  }
}

// ---------------------------------------------------------------------------
// GREEN: closed=8 ≥ baseline(5), wip=6 ≤ baseline(10)+1  → KPI green
// ---------------------------------------------------------------------------

/**
 * Todo tasks producing a green-KPI day on 2024-01-15.
 *
 * closed=8 (5 prior-day tasks completed today + 3 full-flow),
 * fullFlow=3, planned=3, wip=6.
 *
 * Baseline weekday medians: closed=5, wip=10.
 * KPI: goodClosed(8≥5) AND goodWip(6≤11) → green.
 */
export const GREEN_TASKS: TodoTask[] = [
  // 5 tasks created yesterday, completed today → closed+=5
  makeTask('g-c1', 'completed', JAN15_START_MS - 86_400_000, JAN15_9AM_MS - 3600000),
  makeTask('g-c2', 'completed', JAN15_START_MS - 86_400_000, JAN15_9AM_MS - 3500000),
  makeTask('g-c3', 'completed', JAN15_START_MS - 86_400_000, JAN15_9AM_MS - 3400000),
  makeTask('g-c4', 'completed', JAN15_START_MS - 86_400_000, JAN15_9AM_MS - 3300000),
  makeTask('g-c5', 'completed', JAN15_START_MS - 86_400_000, JAN15_9AM_MS - 3200000),
  // 3 tasks created AND completed today → closed+=3, fullFlow+=3, planned+=3
  makeTask('g-ff1', 'completed', JAN15_9AM_MS - 1000, JAN15_9AM_MS - 500),
  makeTask('g-ff2', 'completed', JAN15_9AM_MS - 900, JAN15_9AM_MS - 400),
  makeTask('g-ff3', 'completed', JAN15_9AM_MS - 800, JAN15_9AM_MS - 300),
  // 6 open tasks created before today → wip+=6
  makeTask('g-w1', 'input', JAN15_START_MS - 86_400_000),
  makeTask('g-w2', 'inprogress', JAN15_START_MS - 86_400_000 * 2),
  makeTask('g-w3', 'input', JAN15_START_MS - 86_400_000 * 3),
  makeTask('g-w4', 'struggle', JAN15_START_MS - 86_400_000 * 4),
  makeTask('g-w5', 'input', JAN15_START_MS - 86_400_000 * 5),
  makeTask('g-w6', 'inprogress', JAN15_START_MS - 86_400_000 * 6),
]

// ---------------------------------------------------------------------------
// RED: closed=1 < baseline(5), wip=15 > baseline(10)+1  → KPI red
// ---------------------------------------------------------------------------

/**
 * Todo tasks producing a red-KPI day on 2024-01-15.
 *
 * closed=1, fullFlow=0, planned=0, wip=15.
 *
 * Baseline weekday medians: closed=5, wip=10.
 * KPI: !goodClosed(1<5) AND !goodWip(15>11) → red.
 */
export const RED_TASKS: TodoTask[] = [
  // 1 task completed today
  makeTask('r-c1', 'completed', JAN15_START_MS - 86_400_000, JAN15_9AM_MS - 1000),
  // 15 open tasks created before today → wip=15
  makeTask('r-w01', 'input', JAN15_START_MS - 86_400_000),
  makeTask('r-w02', 'input', JAN15_START_MS - 86_400_000 * 2),
  makeTask('r-w03', 'inprogress', JAN15_START_MS - 86_400_000 * 2),
  makeTask('r-w04', 'struggle', JAN15_START_MS - 86_400_000 * 3),
  makeTask('r-w05', 'input', JAN15_START_MS - 86_400_000 * 3),
  makeTask('r-w06', 'inprogress', JAN15_START_MS - 86_400_000 * 4),
  makeTask('r-w07', 'input', JAN15_START_MS - 86_400_000 * 4),
  makeTask('r-w08', 'struggle', JAN15_START_MS - 86_400_000 * 5),
  makeTask('r-w09', 'input', JAN15_START_MS - 86_400_000 * 5),
  makeTask('r-w10', 'inprogress', JAN15_START_MS - 86_400_000 * 6),
  makeTask('r-w11', 'input', JAN15_START_MS - 86_400_000 * 6),
  makeTask('r-w12', 'struggle', JAN15_START_MS - 86_400_000 * 7),
  makeTask('r-w13', 'input', JAN15_START_MS - 86_400_000 * 7),
  makeTask('r-w14', 'inprogress', JAN15_START_MS - 86_400_000 * 8),
  makeTask('r-w15', 'input', JAN15_START_MS - 86_400_000 * 8),
]

// ---------------------------------------------------------------------------
// COLD-START: no history  → daysOfHistory < 7  → KPI cold
// ---------------------------------------------------------------------------

/**
 * Empty daily cache — no history. daysOfHistory=0 < 7 → cold-start gate.
 * KPI renders as 'cold' (grey dot).
 */
export const COLD_CACHE: Record<string, ProductivityDaily> = {}

/**
 * Empty task list for the cold-start scenario.
 * today = { closed:0, fullFlow:0, planned:0, wip:0 }.
 */
export const COLD_TASKS: TodoTask[] = []
