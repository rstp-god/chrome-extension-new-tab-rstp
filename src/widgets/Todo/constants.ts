import type { TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import {
  AlertTriangleIcon,
  CheckIcon,
  InboxIcon,
  LoaderIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react'

/**
 * Linear progression of "active work" states. Forward/backward chevrons on a
 * task card walk along this chain. `completed` and `deleted` are off-chain —
 * those transitions live on the checkbox and trash buttons respectively.
 */
export const STATUS_FLOW: readonly TodoStatus[] = ['input', 'inprogress', 'struggle']

/**
 * Default visible-status set for the widget filter buttons. Anything outside
 * this set (completed, deleted) is hidden until the user toggles its filter.
 */
export const DEFAULT_VISIBLE_STATUSES: readonly TodoStatus[] = ['input', 'inprogress', 'struggle']

/**
 * Lucide icons used in the footer filter buttons + (optionally) anywhere
 * else that needs an at-a-glance status icon.
 */
export const STATUS_ICON: Record<TodoStatus, LucideIcon> = {
  input: InboxIcon,
  inprogress: LoaderIcon,
  struggle: AlertTriangleIcon,
  completed: CheckIcon,
  deleted: Trash2Icon,
}

/**
 * Sentinel `<Select>` value used by `AddTodoDialog` for "no project". Lives
 * here so the form, the submit handler, and any future caller share the
 * same constant rather than retyping the magic string.
 */
export const NO_PROJECT_VALUE = '__none__'
