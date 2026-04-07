import { expect, test } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'
import {
  addWidget,
  launchExtensionContext,
  prepareExtensionPage,
} from '../../../../tests/helpers/extension'

test('chrome library widget interaction scenarios match snapshots', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)
    await addWidget(page, 'chromeLibrary')

    await test.step('Combined mode with search query', async () => {
      await page.getByTestId(TestId.ChromeLibraryOpenSettings).click()
      await expect(page.getByTestId(TestId.ChromeLibrarySettingsDialog)).toBeVisible()
      await page.getByTestId(TestId.ChromeLibrarySettingsCombined).click()
      await expect(page.getByTestId(TestId.ChromeLibrarySettingsDialog)).toBeHidden()
      await page.getByTestId(TestId.ChromeLibrarySearch).fill('react')
      await expect(page.getByTestId(testIds.widgetFrame('chromeLibrary'))).toHaveScreenshot([
        'ChromeLibrary',
        'widget-chrome-library-combined-search.png',
      ])
    })

    await test.step('Bookmarks section mode', async () => {
      await page.getByTestId(TestId.ChromeLibraryOpenSettings).click()
      await page.getByTestId(TestId.ChromeLibrarySettingsSectioned).click()
      await expect(page.getByTestId(TestId.ChromeLibrarySettingsDialog)).toBeHidden()
      await page.getByTestId(TestId.ChromeLibraryModeBookmarks).click()
      await page.getByTestId(TestId.ChromeLibrarySearch).fill('')
      await expect(page.getByTestId(testIds.widgetFrame('chromeLibrary'))).toHaveScreenshot([
        'ChromeLibrary',
        'widget-chrome-library-bookmarks.png',
      ])
    })
  } finally {
    await context.close()
  }
})
