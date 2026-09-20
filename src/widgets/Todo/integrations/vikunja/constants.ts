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
 * The line the integration was built and verified against (see
 * `docs/vikunja-recon.md`). A mismatch is a warning, never a block: the API
 * is stable enough that refusing to connect would be worse than syncing with
 * a caveat.
 */
export const VIKUNJA_SUPPORTED_VERSION_PREFIX = 'v2.6'
