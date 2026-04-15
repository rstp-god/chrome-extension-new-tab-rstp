import { expect, test } from '@playwright/test'
import { TestId, testIds } from '../constants/testIds'
import {
  installDeterministicPageState,
  launchExtensionContext,
  openExtensionNewTab,
  setExtensionTheme,
  stabilizeExtensionUi,
} from '../helpers/extension'

async function openAddWidgetDialog(page: Parameters<typeof stabilizeExtensionUi>[0]) {
  await page.getByTestId(TestId.PinToggle).click()
  await page.getByTestId(TestId.AddWidgetTrigger).click()
  await expect(page.getByTestId(testIds.addWidgetItem('search'))).toBeVisible()
  await expect(page.getByTestId(testIds.addWidgetItem('todo'))).toBeVisible()
  await expect(page.getByTestId(testIds.addWidgetItem('chromeLibrary'))).toBeVisible()
}

async function expectPreviewScreenshot(
  page: Parameters<typeof stabilizeExtensionUi>[0],
  widgetType: 'search' | 'todo' | 'chromeLibrary',
  previewTitle: string,
  screenshotName: string,
) {
  await page.getByTestId(testIds.addWidgetItem(widgetType)).hover()
  const preview = page.getByTestId(TestId.AddWidgetPreview)

  await expect(preview).toBeVisible()
  await expect(page.getByTestId(TestId.AddWidgetPreviewTitle)).toHaveText(previewTitle)
  await page.waitForTimeout(100)

  const box = await preview.boundingBox()
  if (!box) {
    throw new Error(`Preview bounding box not found for widget "${widgetType}"`)
  }

  const screenshot = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip: box,
  })

  expect(screenshot).toMatchSnapshot(['NewTab', screenshotName])
}

async function expectNewTabVisuals(
  page: Parameters<typeof stabilizeExtensionUi>[0],
  options?: { dark?: boolean },
) {
  const suffix = options?.dark ? '-dark' : ''

  await expect(page).toHaveScreenshot(['NewTab', `newtab-default${suffix}.png`])

  await openAddWidgetDialog(page)
  await expectPreviewScreenshot(page, 'search', 'Search', `preview-search${suffix}.png`)
  await expectPreviewScreenshot(page, 'todo', 'Todo', `preview-todo${suffix}.png`)
  await expectPreviewScreenshot(
    page,
    'chromeLibrary',
    'Chrome Library',
    `preview-chrome-library${suffix}.png`,
  )
}

test('matches extension newtab screenshots', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await installDeterministicPageState(page)
    await openExtensionNewTab(page)
    await stabilizeExtensionUi(page)
    await setExtensionTheme(page, 'light')
    await expectNewTabVisuals(page)
  } finally {
    await context.close()
  }
})

test('matches extension newtab screenshots in dark theme', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await installDeterministicPageState(page)
    await openExtensionNewTab(page)
    await stabilizeExtensionUi(page)
    await setExtensionTheme(page, 'dark')
    await expectNewTabVisuals(page, { dark: true })
  } finally {
    await context.close()
  }
})
