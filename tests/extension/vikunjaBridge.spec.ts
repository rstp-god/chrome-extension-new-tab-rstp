import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

import {
  clearExtensionStorage,
  launchExtensionContext,
  openExtensionNewTab,
} from '../helpers/extension'

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

/**
 * The Todo envelope as the **single-board** build wrote it, with a Vikunja
 * integration the background pull can actually schedule: a scope, a full
 * mapping, and a non-default period so the assertion cannot pass by accident.
 *
 * Deliberately left in the old shape. It is what is on a real user's disk
 * after the multi-board update, so it checks two things at once: that the
 * worker still reads it (its schedule schema accepts both shapes), and that
 * the page upgrades it to `boards[]` and writes the upgrade back — which is
 * asserted at the end of the test.
 *
 * Written from the page rather than through the UI on purpose — this test is
 * about the worker reacting to `chrome.storage.onChanged`, not about the
 * connect wizard. The credentials are fictional and the host is never
 * granted, so nothing is ever sent anywhere.
 */
const VIKUNJA_ENVELOPE = {
  meta: { originId: 'playwright', rev: 1, ts: 1_700_000_000_000 },
  state: {
    tasks: [],
    integration: {
      name: 'vikunja',
      config: {
        baseUrl: 'https://vikunja.example',
        token: 'tk_not-a-real-token',
        projectId: 1,
        viewId: 4,
        kanbanMapping: true,
        pullPeriodMin: 15,
      },
      boardName: 'Probe',
      lists: [
        { id: '1', name: 'To-Do', isDefault: true },
        { id: '3', name: 'Done', isTerminal: true },
      ],
      projects: [],
      mapping: {
        input: ['1'],
        inprogress: ['1'],
        struggle: ['1'],
        completed: ['3'],
        deleted: ['1'],
      },
      lastSyncAt: null,
    },
  },
}

/**
 * The same connection in the **current** shape: two boards, each with its own
 * view, columns and mapping, and a period of its own so this case cannot pass
 * on the legacy envelope's alarm.
 *
 * It exercises the other branch of `readVikunjaScheduleFrom` — the one that
 * reads `config.boards` — and the rule that gates it: a schedule is refused
 * while *any* board is unmapped, so both mappings here are filled in.
 */
const VIKUNJA_BOARDS_ENVELOPE = {
  meta: { originId: 'playwright', rev: 1, ts: 1_700_000_000_000 },
  state: {
    tasks: [],
    integration: {
      name: 'vikunja',
      config: {
        baseUrl: 'https://vikunja.example',
        token: 'tk_not-a-real-token',
        boards: [
          {
            projectId: 1,
            viewId: 4,
            name: 'Inbox',
            containers: [
              { id: '1', name: 'To-Do', isDefault: true },
              { id: '3', name: 'Done', isTerminal: true },
            ],
            mapping: {
              input: ['1'],
              inprogress: ['1'],
              struggle: ['1'],
              completed: ['3'],
              deleted: ['1'],
            },
            kanbanMapping: true,
          },
          {
            projectId: 2,
            viewId: 8,
            name: 'Работа',
            containers: [
              { id: '11', name: 'To-Do', isDefault: true },
              { id: '13', name: 'Done', isTerminal: true },
            ],
            mapping: {
              input: ['11'],
              inprogress: ['11'],
              struggle: ['11'],
              completed: ['13'],
              deleted: ['11'],
            },
            kanbanMapping: true,
          },
        ],
        defaultProjectId: 1,
        pullPeriodMin: 1,
      },
      // The three slice fields this backend stopped keeping.
      boardName: null,
      lists: [],
      projects: [],
      mapping: null,
      lastSyncAt: null,
    },
  },
}

/** The boards the stored envelope carries, if any — the upgrade's own output. */
async function storedBoards(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const items = await chrome.storage.local.get('todo-widget:v1')
    const envelope = items['todo-widget:v1'] as
      | { state?: { integration?: { config?: { boards?: unknown } } } }
      | undefined
    return envelope?.state?.integration?.config?.boards ?? null
  })
}

/** `chrome.alarms.get` from the page, polled until it settles either way. */
async function pullAlarmPeriod(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const alarm = await chrome.alarms.get('vikunja-pull')
    return alarm?.periodInMinutes ?? null
  })
}

test('the worker schedules and clears the background pull from stored config', async () => {
  const context = await launchExtensionContext()
  // Kept out here so the cleanup below has the extension page rather than the
  // context's initial `about:blank`, where `chrome.storage` is undefined.
  let opened: Page | null = null

  try {
    const page = await context.newPage()
    opened = page
    await openExtensionNewTab(page)
    await clearExtensionStorage(page)

    // The bridge answering proves the worker is up and its top-level
    // listeners — including `storage.onChanged` — are registered.
    expect(await ping(page)).toMatchObject({ ok: true })

    await page.evaluate(
      (envelope) => chrome.storage.local.set({ 'todo-widget:v1': envelope }),
      VIKUNJA_ENVELOPE,
    )

    await expect
      .poll(() => pullAlarmPeriod(page), { timeout: 10_000 })
      .toBe(VIKUNJA_ENVELOPE.state.integration.config.pullPeriodMin)

    // A page that *loads* the single-board envelope upgrades it and persists
    // the upgrade, so the bytes on disk end up in the current shape — the
    // real path after an extension update. The reload is what makes this the
    // load path: the write above reached the open page as a
    // `storage.onChanged` event, which only updates the store in memory.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect
      .poll(() => storedBoards(page), { timeout: 10_000 })
      .toMatchObject([{ projectId: 1, viewId: 4 }])

    // Disconnecting wipes the local envelope; the worker must clean up after
    // itself rather than keep pulling a project nobody is linked to.
    await page.evaluate(() => chrome.storage.local.remove('todo-widget:v1'))

    await expect.poll(() => pullAlarmPeriod(page), { timeout: 10_000 }).toBeNull()
  } finally {
    // Other specs assume an empty profile: the envelope above would otherwise
    // resurrect a connected integration in the Todo widget.
    if (opened) await clearExtensionStorage(opened)
    await context.close()
  }
})

test('the worker schedules the background pull from a multi-board config', async () => {
  const context = await launchExtensionContext()
  let opened: Page | null = null

  try {
    const page = await context.newPage()
    opened = page
    await openExtensionNewTab(page)
    await clearExtensionStorage(page)

    expect(await ping(page)).toMatchObject({ ok: true })

    await page.evaluate(
      (envelope) => chrome.storage.local.set({ 'todo-widget:v1': envelope }),
      VIKUNJA_BOARDS_ENVELOPE,
    )

    // One alarm for the whole connection, at the period the config names —
    // never one per board, and never the boards' count divided into it.
    await expect
      .poll(() => pullAlarmPeriod(page), { timeout: 10_000 })
      .toBe(VIKUNJA_BOARDS_ENVELOPE.state.integration.config.pullPeriodMin)

    // Nothing left to pull: the alarm goes, exactly as it does for the
    // single-board record above.
    await page.evaluate(() => chrome.storage.local.remove('todo-widget:v1'))

    await expect.poll(() => pullAlarmPeriod(page), { timeout: 10_000 }).toBeNull()
  } finally {
    if (opened) await clearExtensionStorage(opened)
    await context.close()
  }
})
