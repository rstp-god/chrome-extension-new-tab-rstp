import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

import { launchExtensionContext, openExtensionNewTab } from '../helpers/extension'

/**
 * Acceptance tests for the New Tab ↔ service worker bridge: the page really
 * can reach the worker, the second `onMessage` listener does not shadow the
 * Tab Rules one, and a cold worker still answers. No screenshots — this is a
 * transport check.
 */

type PingResponse = { ok: boolean; value: { pong: boolean; at: unknown } }

function ping(page: Page) {
  return page.evaluate(() => chrome.runtime.sendMessage({ type: 'vikunja', op: 'ping' }))
}

/**
 * Stop the extension's service worker via CDP, then ping while it is down so
 * the message itself has to wake it. That is the case the top-level listener
 * registration in `src/background/index.ts` exists for: MV3 delivers the
 * waking event right after script evaluation, so a listener attached behind
 * `await hydratePersistedState()` misses it and the sender sees
 * "Could not establish connection".
 *
 * Note `context.serviceWorkers()` is NOT a usable readiness signal here — it
 * keeps reporting the worker after it stops, and Chrome restarts an extension
 * worker on its own within a second. The CDP status event is the real one,
 * and the ping has to follow it immediately to still land on a cold worker.
 */
async function stopServiceWorker(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page)
  let stopped = false

  cdp.on('ServiceWorker.workerVersionUpdated', (event: unknown) => {
    const { versions = [] } = event as { versions?: { runningStatus?: string }[] }
    if (versions.some((version) => version.runningStatus === 'stopped')) stopped = true
  })

  await cdp.send('ServiceWorker.enable')
  await cdp.send('ServiceWorker.stopAllWorkers')

  // The event normally lands before the command resolves; allow a short grace
  // but not so long that the worker is back up before the ping goes out.
  for (let attempt = 0; attempt < 40 && !stopped; attempt += 1) {
    await page.waitForTimeout(25)
  }

  expect(stopped, 'CDP should report the service worker stopped').toBe(true)
}

test('the new tab page reaches the vikunja bridge in the service worker', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await openExtensionNewTab(page)

    const pong = (await ping(page)) as PingResponse

    expect(pong).toMatchObject({ ok: true, value: { pong: true } })
    expect(typeof pong.value.at).toBe('number')

    // A networked op against a host the user never granted must be refused
    // by the worker's permission gate — not attempted. This is the end-to-end
    // proof that `withVikunjaClient` really runs inside the packed extension.
    const ungranted = await page.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'vikunja',
        op: 'listProjects',
        cfg: { baseUrl: 'https://vikunja.example', token: 'irrelevant' },
      }),
    )

    expect(ungranted).toEqual({ ok: false, errorKey: 'permissionMissing' })

    const status = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATUS' }))

    expect(status).toMatchObject({ ok: true })
  } finally {
    await context.close()
  }
})

test('the bridge answers a ping that cold-starts the service worker', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await openExtensionNewTab(page)

    expect(await ping(page)).toMatchObject({ ok: true })

    await stopServiceWorker(context, page)

    const pong = (await ping(page)) as PingResponse

    expect(pong).toMatchObject({ ok: true, value: { pong: true } })
    expect(typeof pong.value.at).toBe('number')
  } finally {
    await context.close()
  }
})
