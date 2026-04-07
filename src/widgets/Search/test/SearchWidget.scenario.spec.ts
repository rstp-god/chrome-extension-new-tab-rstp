import { expect, test } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'
import { launchExtensionContext, prepareExtensionPage } from '../../../../tests/helpers/extension'

test('search widget typed query state matches snapshot', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)

    await page.getByTestId(TestId.SearchWidgetInput).fill('playwright widgets')
    await expect(page.getByTestId(testIds.widgetFrame('search'))).toHaveScreenshot([
      'Search',
      'widget-search-filled.png',
    ])
  } finally {
    await context.close()
  }
})
