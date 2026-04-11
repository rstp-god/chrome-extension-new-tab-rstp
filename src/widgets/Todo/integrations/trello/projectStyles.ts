/**
 * Trello-specific project pill styling. Lives next to the adapter so any
 * future Notion / Linear adapter doesn't have to know about Trello's color
 * names — each integration ships its own table and converts native colors
 * to a final tailwind class string when constructing `Project` records.
 *
 * Trello has ~10 named label colors plus a `_dark` variant per hue. We
 * collapse the dark variants to the base hue and fall back to a muted
 * style for unknown / null colors.
 */

const TRELLO_COLOR_TO_PILL_CLASS: Record<string, string> = {
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

/**
 * Default class returned for null / unknown Trello colors. Re-exported so
 * `ProjectPill` can fall back to the same value when an integration didn't
 * compute a class.
 */
export const DEFAULT_PROJECT_PILL_CLASS =
  'bg-muted text-muted-foreground ring-1 ring-inset ring-border'

export function getTrelloProjectPillClass(rawColor: string | null): string {
  if (!rawColor) return DEFAULT_PROJECT_PILL_CLASS
  const base = rawColor.replace(/_dark$/, '')
  return TRELLO_COLOR_TO_PILL_CLASS[base] ?? DEFAULT_PROJECT_PILL_CLASS
}
