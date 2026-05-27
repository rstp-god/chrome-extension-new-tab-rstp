import { expect, test, type Page } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds.ts'
import {
  addWidget,
  launchExtensionContext,
  prepareExtensionPage,
  setExtensionTheme,
  stabilizeExtensionUi,
} from '@tests/helpers/extension.ts'

const TODO_EXIT_ANIMATION_MS = 350

async function addTodo(page: Page, title: string, description: string) {
  await page.getByTestId(TestId.TodoOpenAdd).click()
  await expect(page.getByTestId(TestId.TodoAddDialog)).toBeVisible()
  await page.getByTestId(TestId.TodoTitleInput).fill(title)
  await page.getByTestId(TestId.TodoDescriptionInput).fill(description)
  await page.getByTestId(TestId.TodoSubmit).click()
  await expect(page.getByTestId(TestId.TodoAddDialog)).toBeHidden()
  // Wait until the new card actually appears in the widget so subsequent
  // selectors don't race the React render.
  await expect(page.getByTestId(testIds.widgetFrame('todo')).getByText(title)).toBeVisible()
}

function todoFrame(page: Page) {
  return page.getByTestId(testIds.widgetFrame('todo'))
}

function todoCard(page: Page, title: string) {
  // Cards live under `[data-testid^="todo-task-"]`. Filter by visible text
  // so we don't depend on the random UUID in the test id.
  return todoFrame(page).locator('[data-testid^="todo-task-"]').filter({ hasText: title })
}

async function clickNext(page: Page, title: string) {
  await todoCard(page, title).locator('[data-testid^="todo-next-status-"]').click()
}

async function clickPrev(page: Page, title: string) {
  await todoCard(page, title).locator('[data-testid^="todo-prev-status-"]').click()
}

async function clickComplete(page: Page, title: string) {
  await todoCard(page, title).locator('[data-testid^="todo-complete-"]').click()
  await page.waitForTimeout(TODO_EXIT_ANIMATION_MS)
}

async function clickDelete(page: Page, title: string) {
  await todoCard(page, title).locator('[data-testid^="todo-delete-"]').click()
  await page.waitForTimeout(TODO_EXIT_ANIMATION_MS)
}

async function snapshot(page: Page, fileName: string) {
  await expect(todoFrame(page)).toHaveScreenshot(['Todo', fileName])
}

async function resetWidgetState(page: Page, theme: 'light' | 'dark') {
  // The persistent extension context shares `chrome.storage.local` across
  // pages, so the dark-theme run would inherit tasks (and a duplicated
  // widget) added during the light-theme run. Clear storage and reload so
  // each scenario starts from a clean slate.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        chrome.storage.local.clear(() => resolve())
      }),
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await stabilizeExtensionUi(page)
  // Clearing storage wipes the theme preference too; without re-applying it
  // the store falls back to DEFAULT_HEADER_SETTINGS.theme and every default
  // snapshot silently renders dark.
  await setExtensionTheme(page, theme)
}

async function captureTodoScenarios(page: Page, suffix: '' | '-dark') {
  const theme: 'light' | 'dark' = suffix === '-dark' ? 'dark' : 'light'
  await resetWidgetState(page, theme)
  await addWidget(page, 'todo')

  await test.step(`Empty state${suffix}`, async () => {
    await snapshot(page, `widget-todo-empty${suffix}.png`)
  })

  await test.step(`Single task in input section${suffix}`, async () => {
    await addTodo(page, 'Plan refactor', 'Sketch the architecture of the new module')
    await snapshot(page, `widget-todo-single-input${suffix}.png`)
  })

  await test.step(`Status flow → inprogress${suffix}`, async () => {
    await clickNext(page, 'Plan refactor')
    await snapshot(page, `widget-todo-flow-inprogress${suffix}.png`)
  })

  await test.step(`Status flow → struggle${suffix}`, async () => {
    await clickNext(page, 'Plan refactor')
    await snapshot(page, `widget-todo-flow-struggle${suffix}.png`)
  })

  await test.step(`Status flow ← back to inprogress${suffix}`, async () => {
    await clickPrev(page, 'Plan refactor')
    await snapshot(page, `widget-todo-flow-back-inprogress${suffix}.png`)
  })

  await test.step(`Sectioned layout with all flow statuses${suffix}`, async () => {
    // Currently: "Plan refactor" is in `inprogress`. Add a fresh `input`
    // task and a third one we'll move into `struggle`.
    await addTodo(page, 'Inbox idea', 'Capture and triage later')
    await addTodo(page, 'Stuck task', 'Blocked on external dependency')
    await clickNext(page, 'Stuck task') // → inprogress
    await clickNext(page, 'Stuck task') // → struggle
    await snapshot(page, `widget-todo-sectioned${suffix}.png`)
  })

  await test.step(`Completed filter view${suffix}`, async () => {
    await clickComplete(page, 'Plan refactor')
    await page.getByTestId(TestId.TodoFilterCompleted).click()
    await snapshot(page, `widget-todo-completed-filter${suffix}.png`)
    // Toggle the filter back off so the next step starts from the implicit
    // default (`completed` section is currently visible because we toggled
    // it on; clicking again removes it from the explicit set).
    await page.getByTestId(TestId.TodoFilterCompleted).click()
  })

  await test.step(`Deleted filter view${suffix}`, async () => {
    await clickDelete(page, 'Inbox idea')
    await page.getByTestId(TestId.TodoFilterDeleted).click()
    await snapshot(page, `widget-todo-deleted-filter${suffix}.png`)
    await page.getByTestId(TestId.TodoFilterDeleted).click()
  })

  await test.step(`Filter promotion: completed added on top of implicit default${suffix}`, async () => {
    // Implicit default = {input, inprogress, struggle}. Clicking
    // TodoFilterCompleted should *promote* the implicit set to explicit and
    // add `completed`, so all four sections render together.
    await page.getByTestId(TestId.TodoFilterCompleted).click()
    await snapshot(page, `widget-todo-filter-promotion${suffix}.png`)
  })

  await test.step(`Filter fallback: every default toggled off resolves back to default${suffix}`, async () => {
    // Reset back to the implicit default so the toggle sequence is
    // deterministic regardless of prior steps.
    await page.getByTestId(TestId.TodoFilterCompleted).click()
    await page.getByTestId(TestId.TodoFilterInput).click() // → {inprogress, struggle}
    await page.getByTestId(TestId.TodoFilterInprogress).click() // → {struggle}
    await page.getByTestId(TestId.TodoFilterStruggle).click() // → {} → resolved to default
    await snapshot(page, `widget-todo-filter-fallback${suffix}.png`)
  })
}

test('long unbreakable text stays inside the card', async () => {
  const context = await launchExtensionContext()
  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)
    await setExtensionTheme(page, 'light')
    await addWidget(page, 'todo')

    const longTitle = 'a'.repeat(120) + 'B' + 'b'.repeat(80)
    const longDescription = 'x'.repeat(200)
    await addTodo(page, longTitle, longDescription)

    const card = todoCard(page, longTitle.slice(0, 20))
    const frame = todoFrame(page)
    const cardBox = await card.boundingBox()
    const frameBox = await frame.boundingBox()
    if (!cardBox || !frameBox) throw new Error('expected bounding boxes')
    // Allow 2px for sub-pixel rounding.
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(frameBox.x + frameBox.width + 2)
  } finally {
    await context.close()
  }
})

test('todo widget interaction scenarios match snapshots', async () => {
  const context = await launchExtensionContext()

  try {
    const page = await context.newPage()
    await prepareExtensionPage(page)
    await setExtensionTheme(page, 'light')
    await captureTodoScenarios(page, '')

    const darkPage = await context.newPage()
    await prepareExtensionPage(darkPage)
    await setExtensionTheme(darkPage, 'dark')
    await captureTodoScenarios(darkPage, '-dark')
  } finally {
    await context.close()
  }
})
