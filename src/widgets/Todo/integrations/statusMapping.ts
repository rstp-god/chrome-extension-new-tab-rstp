/**
 * The two lookups every integration needs over a `StatusListMapping`, in one
 * place so a second backend cannot quietly disagree with the first about what
 * an unmapped container means.
 */

import { TODO_STATUSES } from '@/widgets/Todo/integrations/types.ts'

import type { StatusListMapping, TodoStatus } from '@/widgets/Todo/integrations/types.ts'

/**
 * Which status a remote container (a Trello list, a Vikunja bucket) belongs
 * to.
 *
 * Iterates `TODO_STATUSES` rather than the mapping's own keys so the answer
 * does not depend on the key order of a persisted object: a container that
 * somehow ended up under two statuses resolves to the earlier one in the
 * canonical order, always.
 *
 * A container in no array at all falls back to `input`. That is deliberate:
 * a column the user forgot to map should surface its tasks as incoming work,
 * not hide them.
 */
export function statusForContainerId(id: string, mapping: StatusListMapping): TodoStatus {
  for (const status of TODO_STATUSES) {
    // Optional: a `StatusListMapping` can arrive from persisted state, and a
    // hand-edited record missing a row must fall back to `input` rather than
    // throw in the middle of a pull.
    if (mapping[status]?.includes(id)) return status
  }
  return 'input'
}

/**
 * Where a task moves when it enters `status`: the first container in the
 * row, by the contract of `StatusListMapping`.
 */
export function primaryContainerIdForStatus(
  status: TodoStatus,
  mapping: StatusListMapping,
): string {
  return mapping[status][0]
}
