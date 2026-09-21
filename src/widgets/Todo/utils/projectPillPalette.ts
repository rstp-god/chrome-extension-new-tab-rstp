/**
 * The Todo widget's project-pill palette, shared by every integration.
 *
 * A `Project` carries a ready-made Tailwind class string (`pillClassName`) so
 * `<ProjectPill>` never learns a backend's colour vocabulary. Each adapter
 * translates its own native colour — Trello's named palette, Vikunja's hex —
 * into one of the hues below, and only this file decides what a hue looks
 * like. One table, one look, however many backends.
 *
 * The hue names are Trello's, because that palette came first and moving the
 * strings would have changed the rendered classes; they read as generic
 * colour names anyway.
 */

export type ProjectPillHue =
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'blue'
  | 'sky'
  | 'lime'
  | 'pink'
  | 'black'

const PROJECT_PILL_CLASS: Record<ProjectPillHue, string> = {
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
 * Fallback for a colour no adapter could place — an unknown name, a missing
 * hex, a project the backend gave no colour at all. `ProjectPill` uses the
 * same value when a `Project` carries no class, so an unstyled pill looks the
 * same however it got that way.
 */
export const DEFAULT_PROJECT_PILL_CLASS =
  'bg-muted text-muted-foreground ring-1 ring-inset ring-border'

/** The class for a hue, or the muted default when the hue is not one of ours. */
export function projectPillClassForHue(hue: string | null): string {
  if (!hue) return DEFAULT_PROJECT_PILL_CLASS
  return PROJECT_PILL_CLASS[hue as ProjectPillHue] ?? DEFAULT_PROJECT_PILL_CLASS
}
