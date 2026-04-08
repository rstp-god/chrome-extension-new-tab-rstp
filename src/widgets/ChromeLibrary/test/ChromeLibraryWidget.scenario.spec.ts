import { expect, test } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'
import {
  addWidget,
  launchExtensionContext,
  prepareExtensionPage,
  setExtensionTheme,
} from '@tests/helpers/extension.ts'

async function captureChromeLibraryScenarios(
  page: Parameters<typeof prepareExtensionPage>[0],
  suffix: '' | '-dark',
) {
  await addWidget(page, 'chromeLibrary')

  await test.step(`Combined mode with search query${suffix}`, async () => {
    await page.getByTestId(TestId.ChromeLibraryOpenSettings).click()
    await expect(page.getByTestId(TestId.ChromeLibrarySettingsDialog)).toBeVisible()
    await page.getByTestId(TestId.ChromeLibrarySettingsCombined).click()
    await expect(page.getByTestId(TestId.ChromeLibrarySettingsDialog)).toBeHidden()
    await page.getByTestId(TestId.ChromeLibrarySearch).fill('react')
    await expect(page.getByTestId(testIds.widgetFrame('chromeLibrary'))).toHaveScreenshot([
      'ChromeLibrary',
      `widget-chrome-library-combined-search${suffix}.png`,
    ])
  })

  await test.step(`Bookmarks section mode${suffix}`, async () => {
    await page.getByTestId(TestId.ChromeLibraryOpenSettings).click()
    await page.getByTestId(TestId.ChromeLibrarySettingsSectioned).click()
    await expect(page.getByTestId(TestId.ChromeLibrarySettingsDialog)).toBeHidden()
    await page.getByTestId(TestId.ChromeLibraryModeBookmarks).click()
    await page.getByTestId(TestId.ChromeLibrarySearch).fill('')
    await expect(page.getByTestId(testIds.widgetFrame('chromeLibrary'))).toHaveScreenshot([
      'ChromeLibrary',
      `widget-chrome-library-bookmarks${suffix}.png`,
    ])
  })
}

test('chrome library widget interaction scenarios match snapshots', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)
    await captureChromeLibraryScenarios(page, '')

    const darkPage = await context.newPage()
    await prepareExtensionPage(darkPage)
    await setExtensionTheme(darkPage, 'dark')
    await captureChromeLibraryScenarios(darkPage, '-dark')
  } finally {
    await context.close()
  }
})
