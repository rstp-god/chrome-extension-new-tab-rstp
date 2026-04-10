import { expect, test } from '@playwright/test'
import { TestId, TestIdPrefix, testIds } from '@tests/constants/testIds'
import {
  addWidget,
  launchExtensionContext,
  prepareExtensionPage,
  setExtensionTheme,
} from '@tests/helpers/extension.ts'

const TODO_EXIT_ANIMATION_MS = 350

async function addTodo(
  page: Parameters<typeof prepareExtensionPage>[0],
  title: string,
  description: string,
) {
  await page.getByTestId(TestId.TodoOpenAdd).click()
  await expect(page.getByTestId(TestId.TodoAddDialog)).toBeVisible()
  await page.getByTestId(TestId.TodoTitleInput).fill(title)
  await page.getByTestId(TestId.TodoDescriptionInput).fill(description)
  await page.getByTestId(TestId.TodoSubmit).click()
  await expect(page.getByTestId(TestId.TodoAddDialog)).toBeHidden()
}

async function captureTodoScenarios(
  page: Parameters<typeof prepareExtensionPage>[0],
  suffix: '' | '-dark',
) {
  await addWidget(page, 'todo')

  await test.step(`Added task state${suffix}`, async () => {
    await addTodo(
      page,
      'Ship Playwright widget tests',
      'Replace SSR render checks with browser scenarios',
    )
    await expect(page.getByTestId(testIds.widgetFrame('todo'))).toContainText(
      'Ship Playwright widget tests',
    )
    await expect(page.getByTestId(testIds.widgetFrame('todo'))).toHaveScreenshot([
      'Todo',
      `widget-todo-task-added${suffix}.png`,
    ])
  })

  await test.step(`Completed tasks state${suffix}`, async () => {
    await page.locator(`[data-testid^="${TestIdPrefix.TodoComplete}-"]`).first().click()
    await page.waitForTimeout(TODO_EXIT_ANIMATION_MS)
    await page.getByTestId(TestId.TodoFilterCompleted).click()
    await expect(page.getByTestId(testIds.widgetFrame('todo'))).toHaveScreenshot([
      'Todo',
      `widget-todo-completed-filter${suffix}.png`,
    ])
    await page.getByTestId(TestId.TodoFilterCompleted).click()
  })

  await test.step(`Deleted tasks state${suffix}`, async () => {
    await addTodo(page, 'Delete me later', 'Used to verify deleted filter scenario')
    await page.locator(`[data-testid^="${TestIdPrefix.TodoDelete}-"]`).first().click()
    await page.waitForTimeout(TODO_EXIT_ANIMATION_MS)
    await page.getByTestId(TestId.TodoFilterDeleted).click()
    await expect(page.getByTestId(testIds.widgetFrame('todo'))).toHaveScreenshot([
      'Todo',
      `widget-todo-deleted-filter${suffix}.png`,
    ])
  })
}

// TODO(phase 7): rewrite this scenario for the sectioned layout + 5-status
// filter buttons introduced in Phase 4 of the Trello integration. Visual
// snapshots in `chromium-mac/` and `chromium-ci/` need to be regenerated.
test.skip('todo widget interaction scenarios match snapshots', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)
    await captureTodoScenarios(page, '')

    const darkPage = await context.newPage()
    await prepareExtensionPage(darkPage)
    await setExtensionTheme(darkPage, 'dark')
    await captureTodoScenarios(darkPage, '-dark')
  } finally {
    await context.close()
  }
})
