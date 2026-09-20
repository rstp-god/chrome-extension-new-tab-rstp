import { isVikunjaRequest, VIKUNJA_UNKNOWN_FAILURE } from '@/background/vikunja/messages.ts'

import type {
  VikunjaOp,
  VikunjaPing,
  VikunjaRequest,
  VikunjaResponse,
} from '@/background/vikunja/messages.ts'

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
      return VIKUNJA_UNKNOWN_FAILURE
  }
}

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
 * Second `chrome.runtime.onMessage` listener alongside `setupMessageHandler`.
 * Chrome fans a message out to every listener, so this one must return
 * `false` for anything that is not ours — returning `true` would hold the
 * response channel open and starve the Tab Rules handler.
 */
export function setupVikunjaBridge(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isVikunjaRequest(message)) return false

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
