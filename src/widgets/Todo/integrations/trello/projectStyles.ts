/**
 * Trello label colour → project pill class.
 *
 * The classes themselves live in `@/widgets/Todo/utils/projectPillPalette.ts`
 * now that a second backend (Vikunja) paints the same pills: this file keeps
 * only the part that is genuinely Trello's, namely that Trello names its ten
 * hues and ships a `_dark` variant of each.
 */

import {
  DEFAULT_PROJECT_PILL_CLASS,
  projectPillClassForHue,
} from '@/widgets/Todo/utils/projectPillPalette.ts'

/**
 * Re-exported so `ProjectPill` and the Trello adapter keep their import
 * paths; the value is the shared one.
 */
export { DEFAULT_PROJECT_PILL_CLASS }

export function getTrelloProjectPillClass(rawColor: string | null): string {
  if (!rawColor) return DEFAULT_PROJECT_PILL_CLASS
  // `green_dark` and `green` render identically — Trello's dark variants are
  // a shade, not a different colour.
  return projectPillClassForHue(rawColor.replace(/_dark$/, ''))
}
