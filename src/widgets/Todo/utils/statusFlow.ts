import { STATUS_FLOW } from '@/widgets/Todo/constants.ts'
import type { TodoStatus } from '@/widgets/Todo/integrations/index.ts'

/**
 * Walks the active-work chain `input → inprogress → struggle` forward.
 * Returns `null` at the chain edge or when called with an off-chain status
 * (`completed` / `deleted`), so callers can disable the button cleanly.
 */
export function getNextStatus(current: TodoStatus): TodoStatus | null {
  const idx = STATUS_FLOW.indexOf(current)
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return null
  return STATUS_FLOW[idx + 1]
}

/**
 * Mirror of `getNextStatus` walking backwards along the chain.
 */
export function getPrevStatus(current: TodoStatus): TodoStatus | null {
  const idx = STATUS_FLOW.indexOf(current)
  if (idx <= 0) return null
  return STATUS_FLOW[idx - 1]
}

/**
 * Whether a status is part of the active-work chain (and therefore eligible
 * for the prev/next chevrons).
 */
export function isFlowStatus(status: TodoStatus): boolean {
  return STATUS_FLOW.includes(status)
}
