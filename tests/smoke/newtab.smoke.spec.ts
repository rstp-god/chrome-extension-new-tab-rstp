import { expect, test } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'
import { addWidget, launchExtensionContext, prepareExtensionPage } from '../helpers/extension'

test('loads extension newtab UI in Chromium', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)

    await expect(page.getByTestId(TestId.SearchWidgetForm)).toBeVisible()
    await expect(page.getByText(/Settings|Настройки/)).toBeVisible()
  } finally {
    await context.close()
  }
})

test('submits search query into a new browser tab', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)

    await page.getByTestId(TestId.SearchWidgetInput).fill('playwright smoke test')

    const newPagePromise = context.waitForEvent('page')
    await page.getByTestId(TestId.SearchWidgetSubmit).click()

    const searchPage = await newPagePromise
    await searchPage.waitForLoadState('domcontentloaded')

    const currentUrl = searchPage.url()

    const isDirectSearch = /google\..*\/search\?q=playwright(\+|%20)smoke(\+|%20)test/i.test(
      currentUrl,
    )

    let isGoogleSorryRedirect = false

    try {
      const parsed = new URL(currentUrl)

      if (/google\./i.test(parsed.hostname) && parsed.pathname.includes('/sorry/')) {
        const continueUrl = parsed.searchParams.get('continue') ?? ''
        isGoogleSorryRedirect = /google\..*\/search\?q=playwright(\+|%20)smoke(\+|%20)test/i.test(
          continueUrl,
        )
      }
    } catch {
      // ignore malformed url parsing
    }

    expect(
      isDirectSearch || isGoogleSorryRedirect,
      `Expected direct Google search URL or Google sorry redirect with embedded search URL, got: ${currentUrl}`,
    ).toBeTruthy()
  } finally {
    await context.close()
  }
})

test('adds todo widget and creates a task in customize mode', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)
    await addWidget(page, 'todo')

    await page.getByTestId(TestId.TodoOpenAdd).click()
    await expect(page.getByTestId(TestId.TodoAddDialog)).toBeVisible()
    await page.getByTestId(TestId.TodoTitleInput).fill('Smoke task')
    await page.getByTestId(TestId.TodoDescriptionInput).fill('Persists after reload')
    await page.getByTestId(TestId.TodoSubmit).click()

    const todoWidget = page.getByTestId(testIds.widgetFrame('todo'))
    await expect(todoWidget).toContainText('Smoke task')
    await expect(page.getByTestId(TestId.AddWidgetTrigger)).toBeVisible()
  } finally {
    await context.close()
  }
})
