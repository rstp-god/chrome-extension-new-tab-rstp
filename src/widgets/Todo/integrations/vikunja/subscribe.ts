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
 * Calls `onEvent` whenever the worker reports that *this* view moved, and
 * answers with the unsubscribe.
 *
 * Three things it deliberately does:
 *
 * - **filters by scope.** One worker, one alarm, but a config the user is
 *   half-way through changing (or a stale page left open on the previous
 *   project) can subscribe for a different pair — and a sync triggered by
 *   another project's broadcast would read a view the widget is not showing;
 * - **re-validates the payload** with Zod even though the sender is our own
 *   worker. `chrome.runtime.onMessage` also delivers the Tab Rules traffic and
 *   whatever our content scripts send, so the guard proves the `type` and the
 *   schema proves the rest;
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

  const listener = (message: unknown): void => {
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
