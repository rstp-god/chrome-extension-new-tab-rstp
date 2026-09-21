/**
 * Vikunja-specific constants on the widget side. Anything tied to the
 * product (UI paths, version expectations) lives here so the form and the
 * adapter stay imports-only.
 */

import type { TodoStatus } from '@/widgets/Todo/integrations/types.ts'

/**
 * Where a user creates a personal API token in the Vikunja web UI. Appended
 * to the instance root the user typed, so the help link points at *their*
 * instance rather than at vikunja.io.
 */
export const VIKUNJA_TOKEN_SETTINGS_PATH = '/user/settings/api-tokens'

/**
 * The 2.6 line the integration was built and verified against (see
 * verified against a 2.6.0 instance), with or without the `v` prefix and with an
 * optional patch component.
 *
 * Anchored on purpose: a prefix test would accept `v2.60`, a future minor
 * release that shares no promises with 2.6 at all.
 */
const TESTED_VERSION_RE = /^v?2\.6(?:\.\d+)?$/

/**
 * Is this instance on the version the integration was verified against?
 *
 * A mismatch is a warning, never a block: the API is stable enough that
 * refusing to connect would be worse than syncing with a caveat.
 */
export function isTestedVikunjaVersion(version: string): boolean {
  return TESTED_VERSION_RE.test(version.trim())
}

/**
 * The two columns the mapping wizard offers to create on a board that has
 * none, keyed by the status they would fill. Values are i18n keys inside the
 * `todoWidget` namespace, not literals: the bucket is created in the user's
 * own language.
 *
 * Only `struggle` and `deleted` are here. `input` / `inprogress` /
 * `completed` map onto columns every kanban board already has (and
 * `completed` must be the view's own done bucket, which the extension cannot
 * conjure), so there is nothing to offer for them.
 */
export const VIKUNJA_MISSING_COLUMN_TITLES = {
  struggle: 'integrations.vikunja.mapping.columnStruggle',
  deleted: 'integrations.vikunja.mapping.columnTrash',
} as const

/**
 * The statuses that exist only inside the extension while the project is in
 * flat mode, in the order the widget lists them.
 *
 * Flat mode maps everything but `completed` onto the view's default bucket,
 * so Vikunja can tell "done" from "not done" and nothing else: a task sitting
 * in `inprogress`, `struggle` or `deleted` looks identical over there.
 * `input` is absent on purpose — it *is* the default bucket, so it round-trips
 * as itself.
 *
 * A constant rather than a derivation from the mapping: the mapping in flat
 * mode is a placeholder that points four statuses at one bucket, and reading
 * the answer out of it would mean re-deriving this rule from its own
 * consequence.
 */
export const VIKUNJA_LOCAL_ONLY_STATUSES: readonly TodoStatus[] = [
  'inprogress',
  'struggle',
  'deleted',
]
