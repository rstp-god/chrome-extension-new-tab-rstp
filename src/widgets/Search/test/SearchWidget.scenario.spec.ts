import { expect, test } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'
import {
  launchExtensionContext,
  prepareExtensionPage,
  setExtensionTheme,
} from '@tests/helpers/extension.ts'

async function captureSearchState(
  page: Parameters<typeof prepareExtensionPage>[0],
  screenshotName: string,
) {
  await page.getByTestId(TestId.SearchWidgetInput).fill('playwright widgets')
  await expect(page.getByTestId(testIds.widgetFrame('search'))).toHaveScreenshot([
    'Search',
    screenshotName,
  ])
}

test('search widget typed query state matches snapshot', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)
    await captureSearchState(page, 'widget-search-filled.png')

    const darkPage = await context.newPage()
    await prepareExtensionPage(darkPage)
    await setExtensionTheme(darkPage, 'dark')
    await captureSearchState(darkPage, 'widget-search-filled-dark.png')
  } finally {
    await context.close()
  }
})
