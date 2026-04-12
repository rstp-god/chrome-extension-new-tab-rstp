import type { TodoStatus } from '@/widgets/Todo/integrations/index.ts'

/**
 * Single source of truth for status-colored UI bits. Currently uses Tailwind
 * utility classes; could move to CSS variables in a `todo.css` file later
 * but the public shape would stay the same so the call sites don't churn.
 *
 * Provider-specific styling (e.g. Trello label colors → project pill class)
 * lives next to its adapter, not here. See
 * `src/widgets/Todo/integrations/trello/projectStyles.ts`.
 */

export const STATUS_BORDER_CLASS: Record<TodoStatus, string> = {
  input: 'border-l-cyan-400',
  inprogress: 'border-l-amber-400',
  struggle: 'border-l-rose-500',
  completed: 'border-l-emerald-500',
  deleted: 'border-l-zinc-500',
}

export const STATUS_PILL_CLASS: Record<TodoStatus, string> = {
  input: 'bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  inprogress: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/30',
  struggle: 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/30',
  completed: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  deleted: 'bg-zinc-500/15 text-zinc-300 ring-1 ring-inset ring-zinc-400/30',
}

export const STATUS_DOT_CLASS: Record<TodoStatus, string> = {
  input: 'bg-cyan-400',
  inprogress: 'bg-amber-400',
  struggle: 'bg-rose-500',
  completed: 'bg-emerald-500',
  deleted: 'bg-zinc-500',
}
