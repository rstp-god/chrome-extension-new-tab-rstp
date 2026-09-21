/**
 * How the widget reads an `IntegrationErrorKey`: which failures the user has
 * to act on, and which ones are not worth shouting about.
 *
 * Shared by the banner, the sync badge and the widget's own sync guards, so
 * "is this terminal?" is answered in one place — three components disagreeing
 * about it is how a banner ends up next to a spinner that will never stop.
 */

import type { IntegrationErrorKey } from '@/widgets/Todo/integrations/types.ts'

/**
 * Failures no further sync can clear: a revoked token, a withdrawn host
 * permission. Retrying is pointless until the user does something — so the
 * widget stops syncing by itself and shows a banner with the one action that
 * helps.
 *
 * Everything else stays as it was: `network` / `rateLimited` pass on their
 * own, `mappingIncomplete` is already visible in the settings, and `conflict`
 * is about one task rather than the widget.
 */
export const TERMINAL_ERROR_KEYS = ['authInvalid', 'permissionMissing'] as const

export type TerminalErrorKey = (typeof TERMINAL_ERROR_KEYS)[number]

export function isTerminalError(
  errorKey: IntegrationErrorKey | null,
): errorKey is TerminalErrorKey {
  return errorKey !== null && (TERMINAL_ERROR_KEYS as readonly string[]).includes(errorKey)
}

/**
 * A failure the badge states quietly instead of in red.
 *
 * Only `network`: a laptop that closed its lid on a train is not a
 * misconfiguration, the mutations are all still queued, and the widget
 * flushes them the moment the connection is back. Painting that destructive
 * would train the user to ignore the colour that means something.
 */
export function isQuietError(errorKey: IntegrationErrorKey | null): boolean {
  return errorKey === 'network'
}
