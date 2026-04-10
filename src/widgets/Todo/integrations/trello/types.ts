/**
 * Trello-specific runtime types. Wire types come from `./schema.ts`; this
 * file holds anything the rest of the adapter (and the store, indirectly)
 * needs to know.
 */

export interface TrelloConfig {
  apiKey: string
  token: string
  /** `null` until the user finishes the board picker step. */
  boardId: string | null
}

/** Versioned JSON blob we hide inside `card.desc` to round-trip our metadata. */
export interface TrelloHiddenMetadata {
  version: 1
  localId: string
  createdAt: number
  statusChangedAt: number
}

export const TRELLO_API_BASE = 'https://api.trello.com/1'
export const TRELLO_HIDDEN_METADATA_VERSION = 1 as const
