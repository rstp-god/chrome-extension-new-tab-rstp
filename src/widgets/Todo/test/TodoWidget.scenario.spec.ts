import { expect, test } from '@playwright/test'
import { TestId, TestIdPrefix, testIds } from '@tests/constants/testIds'
import {
  addWidget,
  launchExtensionContext,
  prepareExtensionPage,
} from '../../../../tests/helpers/extension'

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

test('todo widget interaction scenarios match snapshots', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)
    await addWidget(page, 'todo')

    await test.step('Added task state', async () => {
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
        'widget-todo-task-added.png',
      ])
    })

    await test.step('Completed tasks state', async () => {
      await page.locator(`[data-testid^="${TestIdPrefix.TodoComplete}-"]`).first().click()
      await page.waitForTimeout(TODO_EXIT_ANIMATION_MS)
      await page.getByTestId(TestId.TodoToggleCompleted).click()
      await expect(page.getByTestId(testIds.widgetFrame('todo'))).toHaveScreenshot([
        'Todo',
        'widget-todo-completed-filter.png',
      ])
      await page.getByTestId(TestId.TodoToggleCompleted).click()
    })

    await test.step('Deleted tasks state', async () => {
      await addTodo(page, 'Delete me later', 'Used to verify deleted filter scenario')
      await page.locator(`[data-testid^="${TestIdPrefix.TodoDelete}-"]`).first().click()
      await page.waitForTimeout(TODO_EXIT_ANIMATION_MS)
      await page.getByTestId(TestId.TodoToggleDeleted).click()
      await expect(page.getByTestId(testIds.widgetFrame('todo'))).toHaveScreenshot([
        'Todo',
        'widget-todo-deleted-filter.png',
      ])
    })
  } finally {
    await context.close()
  }
})
