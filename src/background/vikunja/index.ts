import { handleVikunjaRequest } from '@/background/vikunja/handlers.ts'
import { isVikunjaRequest, VIKUNJA_UNKNOWN_FAILURE } from '@/background/vikunja/messages.ts'

import type { VikunjaOp, VikunjaResponse } from '@/background/vikunja/messages.ts'

/**
 * Re-exported so `handleVikunjaRequest` keeps its historical import path
 * (`@/background/vikunja/index.ts`) after the per-op handlers moved out.
 */
export { handleVikunjaRequest }

/**
 * Never log `cfg`: it carries the user's API token. `op` is safe because the
 * guard allowlists it, and only the error's *name* is logged — a message can
 * embed the instance URL the request was aimed at.
 */
function logFailure(op: VikunjaOp, err: unknown): void {
  console.error('[vikunja] request dispatch failed', {
    op,
    error: err instanceof Error ? err.name : 'unknown',
  })
}

/**
 * `sendResponse` throws once the message port is gone — the tab navigated
 * away or closed while the op was in flight. There is nobody left to tell,
 * so swallow it rather than let it escape as an unhandled rejection.
 */
function respond(
  sendResponse: (response: VikunjaResponse<unknown>) => void,
  response: VikunjaResponse<unknown>,
): void {
  try {
    sendResponse(response)
  } catch {
    // Port already closed; the caller is gone.
  }
}

/**
 * Is this message from one of our own extension pages?
 *
 * `chrome.runtime.onMessage` also delivers messages from content scripts —
 * ours run on every https origin — and, if `externally_connectable` is ever
 * widened, from web pages. Those senders must not be able to drive an op
 * that carries the user's Vikunja token, so the bridge answers extension
 * pages only.
 *
 * Note it checks `sender.url`, not `sender.tab`: the New Tab page *is* a tab,
 * so rejecting anything with a tab would reject the only real caller.
 */
function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  try {
    if (sender.id !== chrome.runtime.id) return false
    const extensionRoot = chrome.runtime.getURL('')
    return typeof sender.url === 'string' && sender.url.startsWith(extensionRoot)
  } catch {
    return false
  }
}

/**
 * Second `chrome.runtime.onMessage` listener alongside `setupMessageHandler`.
 * Chrome fans a message out to every listener, so this one must return
 * `false` for anything that is not ours — returning `true` would hold the
 * response channel open and starve the Tab Rules handler.
 */
export function setupVikunjaBridge(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isVikunjaRequest(message)) return false
    // Silent on purpose: an untrusted sender learns nothing, and the other
    // listener keeps its chance to answer.
    if (!isTrustedSender(sender)) return false

    // `handleVikunjaRequest` is async, so a throw inside it surfaces as a
    // rejection below rather than synchronously here.
    handleVikunjaRequest(message)
      .then(
        (response) => respond(sendResponse, response),
        (err: unknown) => {
          logFailure(message.op, err)
          respond(sendResponse, VIKUNJA_UNKNOWN_FAILURE)
        },
      )
      .catch(() => {
        // Terminal guard: `respond` and `logFailure` are already defensive,
        // but a bridge message must never reject into the void.
      })

    return true
  })
}
