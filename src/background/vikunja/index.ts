import type { VikunjaOp, VikunjaRequest, VikunjaResponse } from '@/background/vikunja/messages.ts'

import { isVikunjaRequest } from '@/background/vikunja/messages.ts'

/** Payload of a successful `ping` — the bridge's own liveness probe. */
export interface VikunjaPing {
  pong: true
  at: number
}

const UNKNOWN_FAILURE: VikunjaResponse<never> = { ok: false, errorKey: 'unknown' }

/**
 * Pure dispatcher — no `chrome.*`, so it unit-tests without a mock.
 *
 * Only `ping` is wired up: the network ops arrive in tasks 4–7 and until
 * then answer `unknown` rather than pretending to work.
 */
export async function handleVikunjaRequest(req: VikunjaRequest): Promise<VikunjaResponse<unknown>> {
  switch (req.op) {
    case 'ping': {
      const value: VikunjaPing = { pong: true, at: Date.now() }
      return { ok: true, value }
    }

    default:
      return UNKNOWN_FAILURE
  }
}

/**
 * Never log `cfg`: it carries the user's API token. Only the op name and a
 * stringified error are safe to surface.
 */
function logFailure(op: VikunjaOp, err: unknown): void {
  console.error('[vikunja] request dispatch failed', { op, error: String(err) })
}

/**
 * Second `chrome.runtime.onMessage` listener alongside `setupMessageHandler`.
 * Chrome fans a message out to every listener, so this one must return
 * `false` for anything that is not ours — returning `true` would hold the
 * response channel open and starve the Tab Rules handler.
 */
export function setupVikunjaBridge(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isVikunjaRequest(message)) return false

    try {
      handleVikunjaRequest(message).then(
        (response) => sendResponse(response),
        (err: unknown) => {
          logFailure(message.op, err)
          sendResponse(UNKNOWN_FAILURE)
        },
      )
    } catch (err) {
      logFailure(message.op, err)
      sendResponse(UNKNOWN_FAILURE)
    }

    return true
  })
}
