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

import { scopePair } from './scope.ts'
import { vikunjaBroadcastSchema } from './schema.ts'

import type { RemoteChangeEvent, RemoteScope } from '@/widgets/Todo/integrations/types.ts'

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
 * Calls `onEvent` whenever the worker reports that *this* view moved, and
 * answers with the unsubscribe.
 *
 * Four things it deliberately does:
 *
 * - **checks the sender**, the mirror image of the bridge's own
 *   `isTrustedSender`: this extension's id, and either no `sender.url` (the
 *   service worker, which is the only thing that should be broadcasting) or a
 *   document this extension shipped. A broadcast is acted on by starting a
 *   sync, so "who said so" is worth a check even on a channel only we use;
 * - **filters by scope.** One worker, one alarm, but a config the user is
 *   half-way through changing (or a stale page left open on the previous
 *   project) can subscribe for a different pair — and a sync triggered by
 *   another project's broadcast would read a view the widget is not showing;
 * - **re-validates the payload** with Zod even though the sender is our own
 *   worker. `chrome.runtime.onMessage` also carries the Tab Rules traffic, so
 *   the guard proves the `type` and the schema proves the rest;
 * - **returns nothing from the listener.** A `true` would hold the response
 *   channel open and starve the listeners that actually answer messages.
 *
 * Inert wherever there is no channel — the showcase build, jsdom tests, a
 * stripped `chrome` — because a widget that cannot be told about a change is
 * still a working widget.
 */
export function subscribeVikunjaRemoteChanges(
  scope: RemoteScope,
  onEvent: (event: RemoteChangeEvent) => void,
): () => void {
  if (isShowcaseMode()) return NOOP

  const pair = scopePair(scope)
  if (!pair) return NOOP

  const onMessage = getChromeObject()?.runtime?.onMessage
  if (!onMessage?.addListener || !onMessage.removeListener) return NOOP

  const listener = (message: unknown, sender: chrome.runtime.MessageSender): void => {
    if (!isOwnWorker(sender)) return
    if (!isVikunjaBroadcast(message)) return

    const parsed = vikunjaBroadcastSchema.safeParse(message)
    if (!parsed.success) return

    const broadcast = parsed.data
    if (broadcast.projectId !== pair.projectId || broadcast.viewId !== pair.viewId) return

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
