import { z } from 'zod'

import { VIKUNJA_ERROR_KEYS, VIKUNJA_UNKNOWN_FAILURE } from '@/background/vikunja/messages.ts'
import { getChromeObject, isShowcaseMode } from '@/services/chrome/runtime.ts'

import type { VikunjaRequest, VikunjaResponse } from '@/background/vikunja/messages.ts'

/**
 * Only the *envelope* is validated here. `value` stays `unknown` all the way
 * through and is cast to `T` at the boundary below: the bridge has no idea
 * what any given op returns. Callers (tasks 4–7) parse `value` with their own
 * Zod schema before reading a single field out of it.
 */
const responseSchema = z.union([
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), errorKey: z.enum(VIKUNJA_ERROR_KEYS) }),
])

/** Client-side only: the worker never reports `network`, the transport does. */
const NETWORK_FAILURE = { ok: false, errorKey: 'network' } as const

/**
 * Sends one op to the service worker and resolves with its answer.
 *
 * Never throws and never rejects — every failure mode collapses into an
 * error key:
 * - no extension context (showcase build, tests, stripped `chrome`) → `network`
 * - `chrome.runtime.lastError` or a synchronous throw from `sendMessage` → `network`
 * - a response that does not match the envelope (worker asleep with no
 *   listener answering, so `undefined` comes back) → `unknown`
 */
export function sendVikunjaMessage<T>(req: VikunjaRequest): Promise<VikunjaResponse<T>> {
  return new Promise((resolve) => {
    if (isShowcaseMode()) {
      resolve(NETWORK_FAILURE)
      return
    }

    const chromeObject = getChromeObject()
    if (!chromeObject?.runtime?.sendMessage) {
      resolve(NETWORK_FAILURE)
      return
    }

    let settled = false
    const settle = (response: VikunjaResponse<T>) => {
      if (settled) return
      settled = true
      resolve(response)
    }

    try {
      chromeObject.runtime.sendMessage(req, (raw: unknown) => {
        if (chromeObject.runtime.lastError) {
          settle(NETWORK_FAILURE)
          return
        }

        const parsed = responseSchema.safeParse(raw)
        if (!parsed.success) {
          settle(VIKUNJA_UNKNOWN_FAILURE)
          return
        }

        settle(
          parsed.data.ok
            ? { ok: true, value: parsed.data.value as T }
            : { ok: false, errorKey: parsed.data.errorKey },
        )
      })
    } catch {
      settle(NETWORK_FAILURE)
    }
  })
}
