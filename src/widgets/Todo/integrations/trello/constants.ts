/**
 * Trello-specific constants. Anything tied to the Trello product (URLs,
 * REST roots, magic strings on the wire) lives here so the rest of the
 * adapter stays imports-only.
 */

export const TRELLO_API_BASE = 'https://api.trello.com/1'

/** Public docs page where users grab their personal API key + token. */
export const TRELLO_APP_KEY_URL = 'https://trello.com/app-key'

/** Bumped when the hidden-metadata schema changes. */
export const TRELLO_HIDDEN_METADATA_VERSION = 1 as const
