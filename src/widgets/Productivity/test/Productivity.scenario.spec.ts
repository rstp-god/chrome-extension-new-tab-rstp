import { expect, test, type Page } from '@playwright/test'

import { testIds } from '@tests/constants/testIds.ts'
import {
  addWidget,
  launchExtensionContext,
  prepareExtensionPage,
  setExtensionTheme,
  stabilizeExtensionUi,
} from '@tests/helpers/extension.ts'
import {
  BASELINE_CACHE,
  COLD_CACHE,
  COLD_TASKS,
  GREEN_TASKS,
  RED_TASKS,
} from '@/widgets/Productivity/showcase/mocks.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'
import type { ProductivityDaily } from '@/widgets/Productivity/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function productivityFrame(page: Page) {
  return page.getByTestId(testIds.widgetFrame('productivity'))
}

async function snapshot(page: Page, fileName: string) {
  await expect(productivityFrame(page)).toHaveScreenshot(['Productivity', fileName])
}

/**
 * Seed both the daily-cache and the Todo task list, then reload so the stores
 * pick up the new values on mount.
 *
 * - `productivity_daily` is a raw Record<string, ProductivityDaily> — no envelope.
 * - `todo-widget:v1` IS an envelope; we write it with rev=9000 so `withChromeSync`
 *   picks it up over any previously written value (lastRev starts at 0 on a fresh
 *   page; we use 9000 as a safe high-water mark).
 */
async function seedProductivityState(
  page: Page,
  opts: {
    dailyCache: Record<string, ProductivityDaily>
    tasks: TodoTask[]
  },
) {
  await page.evaluate(
    ({ cache, todoEnvelope }) =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.local.set(
          {
            productivity_daily: cache,
            'todo-widget:v1': todoEnvelope,
          },
          () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message ?? 'storage error'))
            } else {
              resolve()
            }
          },
        )
      }),
    {
      cache: opts.dailyCache,
      todoEnvelope: {
        meta: { originId: 'e2e-fixture', rev: 9000, ts: Date.now() },
        state: { tasks: opts.tasks, integration: null },
      },
    },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await stabilizeExtensionUi(page)
}

/**
 * Clear storage and reload to a known-empty state, then re-apply theme.
 */
async function resetWidgetState(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        chrome.storage.local.clear(() => resolve())
      }),
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await stabilizeExtensionUi(page)
  await setExtensionTheme(page, theme)
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

async function captureScenarios(page: Page, suffix: '' | '-dark') {
  const theme: 'light' | 'dark' = suffix === '-dark' ? 'dark' : 'light'
  await resetWidgetState(page, theme)
  await addWidget(page, 'productivity')

  // ── Cold-start state ──────────────────────────────────────────────────────
  // No history, no tasks. The widget shows all-zero metrics and a grey KPI dot.

  await test.step(`Cold-start state${suffix}`, async () => {
    await seedProductivityState(page, {
      dailyCache: COLD_CACHE,
      tasks: COLD_TASKS,
    })

    // Re-add the widget because seedProductivityState reloads the page.
    await addWidget(page, 'productivity')

    // Wait for the widget to finish loading (skeleton disappears)
    await expect(
      page.getByTestId('productivity-widget').or(page.getByTestId('productivity-widget-error')),
    ).toBeVisible({ timeout: 15_000 })

    // Functional: KPI dot is present
    await expect(productivityFrame(page).getByTestId('kpi-dot')).toBeVisible()

    // Functional: the four metric numbers are present (closed is always shown)
    await expect(productivityFrame(page).getByTestId('productivity-metrics-grid')).toBeVisible()

    await snapshot(page, `widget-productivity-cold${suffix}.png`)
  })

  // ── Green KPI state ───────────────────────────────────────────────────────
  // Full 14-day baseline + tasks that close 8 and keep wip at 6.

  await test.step(`Green KPI state${suffix}`, async () => {
    await seedProductivityState(page, {
      dailyCache: BASELINE_CACHE,
      tasks: GREEN_TASKS,
    })
    await addWidget(page, 'productivity')

    await expect(
      page.getByTestId('productivity-widget').or(page.getByTestId('productivity-widget-error')),
    ).toBeVisible({ timeout: 15_000 })
    await expect(productivityFrame(page).getByTestId('kpi-dot')).toBeVisible()
    await expect(productivityFrame(page).getByTestId('productivity-metrics-grid')).toBeVisible()

    await snapshot(page, `widget-productivity-green${suffix}.png`)
  })

  // ── Red KPI state ─────────────────────────────────────────────────────────
  // Full 14-day baseline + tasks that close only 1 and pile wip to 15.

  await test.step(`Red KPI state${suffix}`, async () => {
    await seedProductivityState(page, {
      dailyCache: BASELINE_CACHE,
      tasks: RED_TASKS,
    })
    await addWidget(page, 'productivity')

    await expect(
      page.getByTestId('productivity-widget').or(page.getByTestId('productivity-widget-error')),
    ).toBeVisible({ timeout: 15_000 })
    await expect(productivityFrame(page).getByTestId('kpi-dot')).toBeVisible()
    await expect(productivityFrame(page).getByTestId('productivity-metrics-grid')).toBeVisible()

    await snapshot(page, `widget-productivity-red${suffix}.png`)
  })

  // ── Settings sheet ────────────────────────────────────────────────────────
  // (Checked against green state which remains loaded.)

  await test.step(`Settings sheet${suffix}`, async () => {
    // Open the sheet via the settings gear button inside the widget
    const settingsBtn = productivityFrame(page).locator('button[aria-label]').last()
    await settingsBtn.click()

    // The sheet is rendered in a portal; locate it by its heading text
    const sheet = page.locator('[data-slot="sheet-content"]')
    await expect(sheet).toBeVisible()

    // Functional: all four toggle switches are visible
    const switches = sheet.locator('[role="switch"]')
    await expect(switches).toHaveCount(4)

    // Functional: toggling showFullFlow works (click and check aria-checked flips)
    const firstSwitch = switches.first()
    const initialChecked = await firstSwitch.getAttribute('aria-checked')
    await firstSwitch.click()
    const flippedChecked = await firstSwitch.getAttribute('aria-checked')
    expect(flippedChecked).not.toBe(initialChecked)

    // Close the sheet
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
  })
}

// ---------------------------------------------------------------------------
// Test entry point
// ---------------------------------------------------------------------------

test('productivity widget scenarios match snapshots', async () => {
  const context = await launchExtensionContext()
  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)
    await setExtensionTheme(page, 'light')
    await captureScenarios(page, '')

    const darkPage = await context.newPage()
    await prepareExtensionPage(darkPage)
    await setExtensionTheme(darkPage, 'dark')
    await captureScenarios(darkPage, '-dark')
  } finally {
    await context.close()
  }
})
