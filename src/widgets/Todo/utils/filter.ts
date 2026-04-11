import { TODO_STATUSES, type TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'

/**
 * The implicit "default view": when the user hasn't touched any filter
 * button, these are the statuses we render. The chain matches `STATUS_FLOW`
 * — completed and deleted are off-chain and require an explicit toggle.
 */
export const DEFAULT_VISIBLE_STATUSES: ReadonlySet<TodoStatus> = new Set<TodoStatus>([
  'input',
  'inprogress',
  'struggle',
])

/**
 * Picks the timestamp used for desc sorting inside a section. Priority:
 * `statusChangedAt` (the last meaningful event) → `deletedAt` → `completedAt`
 * → `createdAt`. Most tasks will have `statusChangedAt` set since the store
 * stamps it on every status transition.
 */
export function getTaskSortTimestamp(task: TodoTask): number {
  if (task.statusChangedAt) return task.statusChangedAt
  if (task.deletedAt) return task.deletedAt
  if (task.completedAt) return task.completedAt
  return task.createdAt
}

/**
 * "Empty filter set" is treated as the default view rather than "show
 * nothing" — both the section list and the footer button highlights read
 * from this derived value, which is what keeps the widget from rendering
 * an empty list when the user toggles all filters off.
 */
export function resolveVisibleStatuses(
  visibleStatuses: ReadonlySet<TodoStatus>,
): ReadonlySet<TodoStatus> {
  return visibleStatuses.size === 0
    ? new Set<TodoStatus>(DEFAULT_VISIBLE_STATUSES)
    : visibleStatuses
}

/**
 * Promotes the implicit default to an explicit set on the first toggle so
 * the click does what the user sees: e.g. if all default filters look
 * active and they click `input`, the result is `{inprogress, struggle}` —
 * not `{input}`.
 */
export function toggleVisibleStatus(
  current: ReadonlySet<TodoStatus>,
  status: TodoStatus,
): ReadonlySet<TodoStatus> {
  const base = current.size === 0 ? new Set<TodoStatus>(DEFAULT_VISIBLE_STATUSES) : new Set(current)
  if (base.has(status)) base.delete(status)
  else base.add(status)
  return base
}

export interface TodoSection {
  status: TodoStatus
  tasks: TodoTask[]
}

/**
 * Buckets tasks by status, sorts each bucket desc by `getTaskSortTimestamp`,
 * and returns only the sections present in `visibleStatuses` — preserving
 * the canonical `TODO_STATUSES` order. Empty sections are kept in the
 * result so the rendering layer can decide whether to skip them.
 */
export function groupTasksBySection(
  tasks: TodoTask[],
  visibleStatuses: ReadonlySet<TodoStatus>,
): TodoSection[] {
  const grouped = new Map<TodoStatus, TodoTask[]>()
  for (const status of TODO_STATUSES) grouped.set(status, [])
  for (const task of tasks) {
    grouped.get(task.status)?.push(task)
  }
  for (const status of TODO_STATUSES) {
    grouped
      .get(status)
      ?.sort((left, right) => getTaskSortTimestamp(right) - getTaskSortTimestamp(left))
  }
  return TODO_STATUSES.filter((status) => visibleStatuses.has(status)).map((status) => ({
    status,
    tasks: grouped.get(status) ?? [],
  }))
}
