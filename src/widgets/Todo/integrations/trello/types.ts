/**
 * Trello-specific runtime types. Wire types come from `./schema.ts`; this
 * file holds the public-facing config + metadata shapes the rest of the
 * adapter (and indirectly the store) needs to know about.
 *
 * Constants like `TRELLO_API_BASE` live in `./constants.ts`.
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
