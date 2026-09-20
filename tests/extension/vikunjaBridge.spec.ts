import { expect, test } from '@playwright/test'
import { launchExtensionContext, openExtensionNewTab } from '../helpers/extension'

/**
 * Acceptance test for the New Tab ↔ service worker bridge: the page really
 * can reach the worker, and the second `onMessage` listener does not shadow
 * the Tab Rules one. No screenshots — this is a transport check.
 */
test('the new tab page reaches the vikunja bridge in the service worker', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await openExtensionNewTab(page)

    const pong = await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'vikunja', op: 'ping' }),
    )

    expect(pong).toMatchObject({ ok: true, value: { pong: true } })
    expect(typeof (pong as { value: { at: unknown } }).value.at).toBe('number')

    const unimplemented = await page.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'vikunja',
        op: 'listProjects',
        cfg: { baseUrl: 'https://vikunja.example', token: 'irrelevant' },
      }),
    )

    expect(unimplemented).toEqual({ ok: false, errorKey: 'unknown' })

    const status = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATUS' }))

    expect(status).toMatchObject({ ok: true })
  } finally {
    await context.close()
  }
})
