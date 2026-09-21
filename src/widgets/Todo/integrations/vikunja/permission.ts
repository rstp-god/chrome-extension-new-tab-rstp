/**
 * Re-requesting the host permission the instance needs, after the user has
 * taken it away.
 *
 * Vikunja's origin is an *optional* host permission — the instance is
 * unknown at build time — so it can be withdrawn from `chrome://extensions`
 * long after the connect wizard granted it. The worker then answers every op
 * with `permissionMissing`, and this is what the widget's banner calls to get
 * it back.
 *
 * Its own module rather than a method on the adapter: the call has to happen
 * inside a click on the page (Chrome grants an optional origin from a user
 * gesture only), which is the one thing the adapter — a thing the store talks
 * to — never has.
 */

import { vikunjaHostPattern } from '@/background/vikunja/messages.ts'
import { getChromeObject } from '@/services/chrome/runtime.ts'

import type { VikunjaConfig } from '@/widgets/Todo/store/store.ts'

/** Nothing was granted, and nothing was asked. */
const REFUSED = Promise.resolve(false)

/**
 * Asks Chrome for the instance's origin again and answers whether it is ours
 * now.
 *
 * **Not `async`.** An `async` function would already have suspended by the
 * time `permissions.request` ran, and Chrome would refuse the prompt as
 * gesture-less; this one calls it synchronously and hands back the promise it
 * produced, exactly like the connect form's submit handler does. The caller's
 * side of that bargain is to invoke it as the first thing in the click.
 *
 * Every failure reads as "not granted": a dismissed prompt, a host the
 * pattern builder refuses (which is where a wildcard origin would be caught),
 * a `chrome` without `permissions` in the showcase build or a test.
 */
export function recoverVikunjaPermission(config: unknown): Promise<boolean> {
  // The config is `unknown` by contract, and this runs inside a click: a
  // throw here would surface as an unhandled error in the event handler
  // rather than as "nothing was granted".
  const baseUrl = (config as VikunjaConfig | null | undefined)?.baseUrl
  const pattern = typeof baseUrl === 'string' ? vikunjaHostPattern(baseUrl) : null
  if (pattern === null) return REFUSED

  const permissions = getChromeObject()?.permissions
  if (!permissions?.request) return REFUSED

  try {
    // `Promise.resolve` normalises the MV3 promise form without adding an
    // await before the call itself.
    return Promise.resolve(permissions.request({ origins: [pattern] })).then(
      (granted) => granted === true,
      () => false,
    )
  } catch {
    return REFUSED
  }
}
