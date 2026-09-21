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
