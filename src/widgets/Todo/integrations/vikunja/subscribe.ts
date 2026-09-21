/**
 * The widget's ear for the worker's background pull.
 *
 * Vikunja is the one backend the widget does not have to poll: the service
 * worker reads the configured view on a `chrome.alarms` schedule and
 * broadcasts what moved, so an open New Tab page finds out about a task
 * someone else ticked off without asking anybody. This is the receiving end —
 * a plain `chrome.runtime.onMessage` listener, plus the two checks that make
 * it safe.
 */

import { isVikunjaBroadcast } from '@/background/vikunja/messages.ts'
import { getChromeObject, isShowcaseMode } from '@/services/chrome/runtime.ts'

import { boardScopes } from './boards.ts'
import { vikunjaBroadcastSchema } from './schema.ts'

import type { RemoteChangeEvent } from '@/widgets/Todo/integrations/types.ts'
import type { IntegrationState } from '@/widgets/Todo/store/store.ts'

/** Nothing to unsubscribe from. */
const NOOP = () => {}

/**
 * Did this come from our own service worker (or, at worst, another page of
 * this same extension)?
 *
 * `sender.url` is absent for the service worker — which is the only thing
 * that legitimately broadcasts — and is an extension URL for our own pages.
 * Anything else, including a different extension's id, is not ours to act on.
 * Defensive rather than load-bearing: a web page cannot reach `onMessage` at
 * all (`externally_connectable` traffic arrives on `onMessageExternal`), and
 * this extension injects nothing into other origins. It is the counterpart of
 * the bridge's `isTrustedSender` on the worker side, so both directions of
 * the channel are checked the same way.
 */
function isOwnWorker(sender: chrome.runtime.MessageSender): boolean {
  try {
    const runtime = getChromeObject()?.runtime
    if (!runtime) return false
    if (sender.id !== runtime.id) return false
    if (sender.url === undefined) return true
    const extensionRoot = runtime.getURL?.('') ?? ''
    return extensionRoot.length > 0 && sender.url.startsWith(extensionRoot)
  } catch {
    return false
  }
}

/**
 * Calls `onEvent` whenever the worker reports that one of *this connection's*
 * boards moved, and answers with the unsubscribe.
 *
 * Four things it deliberately does:
 *
 * - **checks the sender**, the mirror image of the bridge's own
 *   `isTrustedSender`: this extension's id, and either no `sender.url` (the
 *   service worker, which is the only thing that should be broadcasting) or a
 *   document this extension shipped. A broadcast is acted on by starting a
 *   sync, so "who said so" is worth a check even on a channel only we use;
 * - **filters by board.** One worker, one alarm, and a broadcast names the
 *   project and view it is about — while a config the user is half-way
 *   through changing (or a stale page left open on a project they removed)
 *   can be listening for something else entirely. Every board of this
 *   connection is accepted and nothing else is: a sync reads all of them, so
 *   a broadcast about any one of them is news, and one about a project this
 *   connection does not sync is not this subscriber's business;
 * - **re-validates the payload** with Zod even though the sender is our own
 *   worker. `chrome.runtime.onMessage` also carries the Tab Rules traffic, so
 *   the guard proves the `type` and the schema proves the rest;
 * - **returns nothing from the listener.** A `true` would hold the response
 *   channel open and starve the listeners that actually answer messages.
 *
 * Inert wherever there is no channel — the showcase build, jsdom tests, a
 * stripped `chrome` — because a widget that cannot be told about a change is
 * still a working widget. Inert, too, for a connection with no board: there
 * is no view anybody could report on yet.
 */
export function subscribeVikunjaRemoteChanges(
  integration: IntegrationState,
  onEvent: (event: RemoteChangeEvent) => void,
): () => void {
  if (isShowcaseMode()) return NOOP
  if (integration.name !== 'vikunja') return NOOP

  const scopes = boardScopes(integration.config)
  if (scopes.length === 0) return NOOP

  const onMessage = getChromeObject()?.runtime?.onMessage
  if (!onMessage?.addListener || !onMessage.removeListener) return NOOP

  const listener = (message: unknown, sender: chrome.runtime.MessageSender): void => {
    if (!isOwnWorker(sender)) return
    if (!isVikunjaBroadcast(message)) return

    const parsed = vikunjaBroadcastSchema.safeParse(message)
    if (!parsed.success) return

    const broadcast = parsed.data
    const known = scopes.some(
      (scope) => scope.projectId === broadcast.projectId && scope.viewId === broadcast.viewId,
    )
    if (!known) return

    onEvent(
      broadcast.type === 'vikunja/pulled'
        ? { kind: 'changed' }
        : { kind: 'failed', errorKey: broadcast.errorKey },
    )
  }

  onMessage.addListener(listener)
  return () => {
    onMessage.removeListener(listener)
  }
}
