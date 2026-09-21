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

/**
 * `maxLength` of the two free-text inputs in `AddTodoDialog`.
 *
 * A UX guard, not the wire guarantee. The title ceiling is the API's own
 * (`VIKUNJA_MAX_TITLE_LENGTH`), while the description budget is deliberately
 * lower than the API's 16 384: the text is stored as HTML, and escaping can
 * expand a character fivefold (`&` → `&amp;`), so no plain-text number both
 * feels generous and provably fits. `clampForVikunja` in the Vikunja adapter
 * is what actually keeps a payload inside the limit — this pair just stops the
 * form accepting a novel in the first place.
 */
export const TODO_TITLE_MAX_LENGTH = 1024
export const TODO_DESCRIPTION_MAX_LENGTH = 8000
