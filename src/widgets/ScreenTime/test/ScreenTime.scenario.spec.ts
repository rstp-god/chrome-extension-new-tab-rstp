import { expect, test, type Page } from '@playwright/test'

import {
  buildDayFixture,
  buildWeekFixture,
  seedActivityStorage,
} from '@tests/helpers/activityFixtures.ts'
import { TestId, testIds } from '@tests/constants/testIds.ts'
import {
  addWidget,
  launchExtensionContext,
  prepareExtensionPage,
  setExtensionTheme,
  stabilizeExtensionUi,
} from '@tests/helpers/extension.ts'

const DEFAULT_PALETTE = {
  baseHex: '#38A0D6',
  shades: [
    'oklch(0.865 0.127 207.078)',
    'oklch(0.715 0.143 215.221)',
    'oklch(0.609 0.126 221.723)',
    'oklch(0.52 0.105 223.128)',
    'oklch(0.45 0.085 224.283)',
  ],
}

function screenTimeFrame(page: Page) {
  return page.getByTestId(testIds.widgetFrame('screenTime'))
}

// Recharts SVG anti-aliasing jitter 0.5–1% between runs. Relax the global
// 0.5% threshold to 2% just for these widget shots.
const SNAPSHOT_OPTS = { maxDiffPixelRatio: 0.02 }

async function snapshot(page: Page, fileName: string) {
  await expect(screenTimeFrame(page)).toHaveScreenshot(
    ['ScreenTime', fileName],
    SNAPSHOT_OPTS,
  )
}

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

async function seedAndWait(page: Page, fixtures: Parameters<typeof seedActivityStorage>[1]) {
  await seedActivityStorage(page, fixtures)
  // `withChromeSync` listens on `chrome.storage.onChanged`, so the seed
  // propagates into the snapshot stores without needing a reload — we just
  // give React a beat to re-render with the new data.
  await page.waitForTimeout(600)
}

async function captureScenarios(page: Page, suffix: '' | '-dark') {
  const theme: 'light' | 'dark' = suffix === '-dark' ? 'dark' : 'light'
  await resetWidgetState(page, theme)
  await addWidget(page, 'screenTime')

  await test.step(`Empty state${suffix}`, async () => {
    await snapshot(page, `widget-screen-time-empty${suffix}.png`)
  })

  await test.step(`Bar chart with day data${suffix}`, async () => {
    await seedAndWait(page, { day: buildDayFixture('2024-01-15') })
    await snapshot(page, `widget-screen-time-bar-day${suffix}.png`)
  })

  await test.step(`Area chart with week data${suffix}`, async () => {
    await seedAndWait(page, {
      day: buildDayFixture('2024-01-15'),
      week: buildWeekFixture('2024-01-13'),
      settings: {
        paused: false,
        screenTime: {
          chartType: 'area',
          period: 'week',
          showTopDomains: true,
          showYAxis: true,
          showGrid: false,
          showTooltips: true,
          maxDomains: 5,
          chartPalette: DEFAULT_PALETTE,
        },
        tabStats: {
          visibleMetrics: {
            openNow: true,
            created: true,
            closed: true,
            avgLifetime: true,
            activePct: true,
            peakOpen: false,
          },
          format: 'cards',
          showSparkline: true,
          chartPalette: DEFAULT_PALETTE,
        },
      },
    })
    await snapshot(page, `widget-screen-time-area-week${suffix}.png`)
  })

  await test.step(`Settings dialog open${suffix}`, async () => {
    await page.getByTestId(TestId.ScreenTimeOpenSettings).click()
    await expect(page.getByTestId(TestId.ScreenTimeSettingsDialog)).toBeVisible()
    await expect(page.getByTestId(TestId.ScreenTimeSettingsDialog)).toHaveScreenshot(
      ['ScreenTime', `widget-screen-time-settings${suffix}.png`],
      SNAPSHOT_OPTS,
    )
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(TestId.ScreenTimeSettingsDialog)).toBeHidden()
  })
}

test('screen time widget scenarios match snapshots', async () => {
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
