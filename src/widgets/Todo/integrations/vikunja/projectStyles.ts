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
    PROJECT_PILL_HUES[Math.abs(Math.trunc(projectId)) % PROJECT_PILL_HUES.length],
  )
}
