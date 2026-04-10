import type { TodoStatus } from '@/widgets/Todo/integrations/index.ts'

/**
 * Single source of truth for status-colored UI bits. Currently uses Tailwind
 * utility classes; Phase 4 will likely move to CSS variables in `todo.css` but
 * the public shape stays the same so the call sites don't churn.
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

/**
 * Trello label color → tailwind classes for project pills. Trello has ~10
 * named colors plus `_dark` variants; we collapse the dark variants to the
 * base hue and fall back to a muted style for unknown / null colors.
 */
const TRELLO_PROJECT_PILL_CLASS: Record<string, string> = {
  green: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
  yellow: 'bg-yellow-500/15 text-yellow-300 ring-1 ring-inset ring-yellow-400/30',
  orange: 'bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-400/30',
  red: 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/30',
  purple: 'bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/30',
  blue: 'bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/30',
  sky: 'bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-400/30',
  lime: 'bg-lime-500/15 text-lime-300 ring-1 ring-inset ring-lime-400/30',
  pink: 'bg-pink-500/15 text-pink-300 ring-1 ring-inset ring-pink-400/30',
  black: 'bg-zinc-500/15 text-zinc-300 ring-1 ring-inset ring-zinc-400/30',
}

const DEFAULT_PROJECT_PILL_CLASS = 'bg-muted text-muted-foreground ring-1 ring-inset ring-border'

export function getProjectPillClass(colorToken: string | null): string {
  if (!colorToken) return DEFAULT_PROJECT_PILL_CLASS
  const base = colorToken.replace(/_dark$/, '')
  return TRELLO_PROJECT_PILL_CLASS[base] ?? DEFAULT_PROJECT_PILL_CLASS
}
