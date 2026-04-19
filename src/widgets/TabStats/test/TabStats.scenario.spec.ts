import { expect, test, type Page } from '@playwright/test'

import {
  buildAllFixture,
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

function buildSettings(format: 'cards' | 'list' | 'radial') {
  return {
    paused: false,
    screenTime: {
      chartType: 'bar' as const,
      period: 'day' as const,
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
      format,
      showSparkline: true,
      chartPalette: DEFAULT_PALETTE,
    },
  }
}

function tabStatsFrame(page: Page) {
  return page.getByTestId(testIds.widgetFrame('tabStats'))
}

async function snapshot(page: Page, fileName: string) {
  await expect(tabStatsFrame(page)).toHaveScreenshot(['TabStats', fileName])
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
  await page.waitForTimeout(600)
}

async function captureScenarios(page: Page, suffix: '' | '-dark') {
  const theme: 'light' | 'dark' = suffix === '-dark' ? 'dark' : 'light'
  await resetWidgetState(page, theme)
  await addWidget(page, 'tabStats')

  await test.step(`Empty state${suffix}`, async () => {
    await snapshot(page, `widget-tab-stats-empty${suffix}.png`)
  })

  await test.step(`Cards layout${suffix}`, async () => {
    await seedAndWait(page, {
      day: buildDayFixture('2024-01-15'),
      week: buildWeekFixture('2024-01-13'),
      all: buildAllFixture('2024-01-15', '2024-01-14'),
      settings: buildSettings('cards'),
    })
    await snapshot(page, `widget-tab-stats-cards${suffix}.png`)
  })

  await test.step(`List layout${suffix}`, async () => {
    await seedAndWait(page, {
      day: buildDayFixture('2024-01-15'),
      week: buildWeekFixture('2024-01-13'),
      all: buildAllFixture('2024-01-15', '2024-01-14'),
      settings: buildSettings('list'),
    })
    await snapshot(page, `widget-tab-stats-list${suffix}.png`)
  })

  await test.step(`Radial layout${suffix}`, async () => {
    await seedAndWait(page, {
      day: buildDayFixture('2024-01-15'),
      week: buildWeekFixture('2024-01-13'),
      all: buildAllFixture('2024-01-15', '2024-01-14'),
      settings: buildSettings('radial'),
    })
    await snapshot(page, `widget-tab-stats-radial${suffix}.png`)
  })

  await test.step(`Settings dialog open${suffix}`, async () => {
    await page.getByTestId(TestId.TabStatsOpenSettings).click()
    await expect(page.getByTestId(TestId.TabStatsSettingsDialog)).toBeVisible()
    await expect(page.getByTestId(TestId.TabStatsSettingsDialog)).toHaveScreenshot([
      'TabStats',
      `widget-tab-stats-settings${suffix}.png`,
    ])
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(TestId.TabStatsSettingsDialog)).toBeHidden()
  })
}

test('tab stats widget scenarios match snapshots', async () => {
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
