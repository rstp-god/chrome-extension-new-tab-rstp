/**
 * Vikunja-specific constants on the widget side. Anything tied to the
 * product (UI paths, version expectations) lives here so the form and the
 * adapter stay imports-only.
 */

/**
 * Where a user creates a personal API token in the Vikunja web UI. Appended
 * to the instance root the user typed, so the help link points at *their*
 * instance rather than at vikunja.io.
 */
export const VIKUNJA_TOKEN_SETTINGS_PATH = '/user/settings/api-tokens'

/**
 * The 2.6 line the integration was built and verified against (see
 * `docs/vikunja-recon.md`), with or without the `v` prefix and with an
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
 * Label prefixes the widget must pretend not to see.
 *
 * The instance this integration was built against already uses `energy:*` and
 * `mood:*` labels for a different feature of the user's own workflow (recon
 * Q13). Surfacing them as Todo "projects" would bury the real ones, and task
 * 6 must never strip them off a task it edits — a sync that quietly deletes
 * someone's labels is worse than no sync.
 */
export const VIKUNJA_RESERVED_LABEL_PREFIXES = ['energy:', 'mood:'] as const

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
