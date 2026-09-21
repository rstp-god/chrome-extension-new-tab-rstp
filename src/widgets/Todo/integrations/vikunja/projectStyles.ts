/**
 * Vikunja board → project pill class.
 *
 * It used to be a colour match: the widget surfaced the instance's labels as
 * its projects, a label carries a free-form `hex_color`, and this file did the
 * HSL arithmetic that picked the nearest of the widget's ten hues. None of
 * that survived the move to "a project *is* the board" — a board has no colour
 * of its own — so the arithmetic is gone and the hue comes from the project
 * id. Everything visual still lives in
 * `@/widgets/Todo/utils/projectPillPalette.ts`.
 */

import {
  DEFAULT_PROJECT_PILL_CLASS,
  PROJECT_PILL_HUES,
  projectPillClassForHue,
} from '@/widgets/Todo/utils/projectPillPalette.ts'

/**
 * The hues a board may be painted in: every one but the neutral grey.
 *
 * `black` is the palette's colourless bucket (zinc), and it is what the
 * *fallback* pill already looks like — a board that happened to land on it
 * would read as "no colour could be found for this one" rather than as its
 * own colour. There is nothing to find here: the hue is derived from the id
 * and always succeeds, so the rotation only offers colours that say so.
 */
const BOARD_PILL_HUES = PROJECT_PILL_HUES.filter((hue) => hue !== 'black')

/**
 * The pill of a board, painted from its project id.
 *
 * An id maps onto the palette: stable (the same board is always the same
 * colour, on every device, with no cache to refresh) and spread out (two
 * boards created one after the other get different hues). `Math.abs` is belt
 * and braces — the schema forbids a non-positive id, and a negative remainder
 * would index outside the palette.
 */
export function getVikunjaBoardPillClass(projectId: number): string {
  if (!Number.isFinite(projectId)) return DEFAULT_PROJECT_PILL_CLASS
  return projectPillClassForHue(
    BOARD_PILL_HUES[Math.abs(Math.trunc(projectId)) % BOARD_PILL_HUES.length],
  )
}
