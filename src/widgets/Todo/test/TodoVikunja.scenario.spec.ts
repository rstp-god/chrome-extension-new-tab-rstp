import { expect, test, type Locator, type Page } from '@playwright/test'
import { TODO_STORAGE_KEY } from '@/widgets/Todo/store/keys.ts'
import { TestId, testIds } from '@tests/constants/testIds.ts'
import {
  addWidget,
  clearExtensionStorage,
  launchExtensionContext,
  prepareExtensionPage,
  setExtensionTheme,
  stabilizeExtensionUi,
} from '@tests/helpers/extension.ts'

/**
 * Visual scenarios for the screens the Vikunja integration added: the connect
 * form, the bucket wizard, the flat-mode summary, the lost-permission banner
 * and the local-task import.
 *
 * **Nothing here touches a network.** Every state is seeded by writing the
 * widget's own envelope into `chrome.storage.local` and reloading — the same
 * trick `tests/extension/vikunjaBridge.spec.ts` uses — so the settings dialog
 * computes its step from persisted state exactly as it would for a real user.
 * The host below is never granted to the extension, which is precisely why the
 * two summary scenarios also show the permission failure: a mounted widget
 * with a finished mapping syncs once, the worker's permission gate refuses it,
 * and that is the honest state of a widget whose instance it cannot reach.
 *
 * A `conflict` badge is deliberately not covered: it is a per-task outcome of
 * a *push* that lost a race, and there is no way to produce one without a
 * backend answering — a `vikunja/pull-failed` broadcast cannot stand in for
 * it. It stays a unit-level case (`tests/stores/todo.store.test.ts`).
 */

interface RawEnvelope {
  meta: { originId: string; rev: number; ts: number }
  state: { tasks: Record<string, unknown>[]; integration: Record<string, unknown> | null }
}

/** Fictional instance, never granted — see the note above. */
const CONFIG = {
  baseUrl: 'https://vikunja.example',
  token: 'tk_not-a-real-token',
  projectId: 1,
  viewId: 4,
  kanbanMapping: true,
}

/** A three-column board: no bucket for `struggle` or `deleted`. */
const LISTS = [
  { id: '1', name: 'To-Do', isDefault: true },
  { id: '2', name: 'Doing' },
  { id: '3', name: 'Done', isTerminal: true },
]

const KANBAN_MAPPING = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['2'],
  completed: ['3'],
  deleted: ['2'],
}

/** Flat mode: everything but `completed` points at the default bucket. */
const FLAT_MAPPING = {
  input: ['1'],
  inprogress: ['1'],
  struggle: ['1'],
  completed: ['3'],
  deleted: ['1'],
}

const BASE_TS = 1_724_000_000_000

function task(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'task-1',
    title: 'Task',
    description: null,
    status: 'input',
    projectId: null,
    createdAt: BASE_TS,
    statusChangedAt: BASE_TS,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
    ...overrides,
  }
}

function linked(taskId: number, overrides: Record<string, unknown> = {}) {
  return {
    taskId,
    identifier: `#${taskId}`,
    bucketId: 1,
    updated: '2024-08-19T12:34:56.000Z',
    ...overrides,
  }
}

function envelope(
  integration: Record<string, unknown> | null,
  tasks: Record<string, unknown>[] = [],
): RawEnvelope {
  return {
    meta: { originId: 'playwright', rev: 1, ts: BASE_TS },
    state: { tasks, integration },
  }
}

function vikunjaIntegration(overrides: Record<string, unknown> = {}) {
  return {
    name: 'vikunja',
    config: CONFIG,
    boardName: 'Probe',
    lists: LISTS,
    projects: [],
    mapping: KANBAN_MAPPING,
    // `null` keeps the summary's "last sync" line at a fixed word.
    lastSyncAt: null,
    ...overrides,
  }
}

function todoFrame(page: Page) {
  return page.getByTestId(testIds.widgetFrame('todo'))
}

function settingsDialog(page: Page) {
  return page.getByTestId(TestId.TodoSettingsDialogContent)
}

async function snapshot(target: Locator, fileName: string) {
  await expect(target).toHaveScreenshot(['TodoVikunja', fileName])
}

/**
 * Puts a state on disk and reloads into it. The reload is what makes this
 * work at all: the store reads its envelope once, when the page's module
 * graph is evaluated.
 */
async function seed(page: Page, raw: RawEnvelope) {
  await page.evaluate(([key, value]) => chrome.storage.local.set({ [key as string]: value }), [
    TODO_STORAGE_KEY,
    raw,
  ] as const)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await stabilizeExtensionUi(page)
  await expect(todoFrame(page)).toBeVisible()
}

/**
 * Writes the layout to storage by leaving customize mode — `Header` commits
 * the widget store on that very click (it is `autoPersist: false`). Without
 * it the first reload would land on a page with no Todo widget at all.
 */
async function commitLayout(page: Page) {
  await page.getByTestId(TestId.PinToggle).click()
  await expect(page.getByTestId(TestId.AddWidgetTrigger)).toBeHidden()
}

async function openSettings(page: Page) {
  await page.getByTestId(TestId.TodoOpenSettings).click()
  await expect(settingsDialog(page)).toBeVisible()
}

async function closeDialog(page: Page, dialog: Locator) {
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
}

/**
 * The mount sync of a fully mapped integration cannot reach the instance, so
 * it settles on `permissionMissing`. Waiting for the banner is how every
 * summary scenario becomes deterministic instead of racing that sync.
 */
async function waitForPermissionBanner(page: Page) {
  await expect(todoFrame(page).getByTestId(TestId.TodoStatusBanner)).toBeVisible()
}

async function captureVikunjaScenarios(page: Page, suffix: '' | '-dark') {
  const theme: 'light' | 'dark' = suffix === '-dark' ? 'dark' : 'light'
  // The persistent context shares storage across pages, so each theme run
  // starts from an empty profile — and re-applies the theme the clear wiped.
  await clearExtensionStorage(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await stabilizeExtensionUi(page)
  await setExtensionTheme(page, theme)
  await addWidget(page, 'todo')
  await commitLayout(page)

  await test.step(`Connect form${suffix}`, async () => {
    await openSettings(page)
    await page.getByTestId(testIds.todoIntegrationPick('vikunja')).click()
    // The instance URL field is the form's own, and the only one in the
    // dialog that cannot belong to another step.
    await expect(page.getByPlaceholder('https://tasks.example.com')).toBeVisible()
    await snapshot(settingsDialog(page), `vikunja-connect-form${suffix}.png`)
    await closeDialog(page, settingsDialog(page))
  })

  await test.step(`Bucket mapping wizard${suffix}`, async () => {
    // A scope but no mapping → the dialog opens on the mapping step, and the
    // widget makes no sync at all.
    await seed(page, envelope(vikunjaIntegration({ mapping: null })))
    await openSettings(page)
    await expect(page.getByTestId(TestId.TodoMappingStep)).toBeVisible()
    // The board has no struggle/trash column, so the wizard offers to build
    // them — and offers flat mode as the way out either way.
    await expect(page.getByTestId(TestId.TodoMissingColumnsPanel)).toBeVisible()
    await expect(page.getByTestId(TestId.TodoFlatModeSection)).toBeVisible()
    await snapshot(settingsDialog(page), `vikunja-mapping-wizard${suffix}.png`)
    await closeDialog(page, settingsDialog(page))
  })

  await test.step(`Flat-mode summary${suffix}`, async () => {
    await seed(
      page,
      envelope(
        vikunjaIntegration({
          config: { ...CONFIG, kanbanMapping: false },
          mapping: FLAT_MAPPING,
        }),
      ),
    )
    await waitForPermissionBanner(page)
    await openSettings(page)
    // The block the flat mode is *about*: the notice plus the statuses that
    // never leave the extension.
    await expect(page.getByTestId(TestId.TodoSummaryFlatMode)).toBeVisible()
    await snapshot(settingsDialog(page), `vikunja-flat-mode${suffix}.png`)
    await closeDialog(page, settingsDialog(page))
  })

  await test.step(`Lost-permission banner${suffix}`, async () => {
    await seed(
      page,
      envelope(vikunjaIntegration(), [
        task({ id: 'task-1', title: 'Write the recon notes', remoteRef: linked(41) }),
        task({
          id: 'task-2',
          title: 'Map the buckets',
          status: 'inprogress',
          remoteRef: linked(42, { bucketId: 2 }),
        }),
        task({
          id: 'task-3',
          title: 'Grant the host again',
          status: 'struggle',
          remoteRef: linked(43, { bucketId: 2 }),
        }),
      ]),
    )
    await waitForPermissionBanner(page)
    await snapshot(todoFrame(page), `vikunja-permission-banner${suffix}.png`)
  })

  await test.step(`Import of local tasks${suffix}`, async () => {
    await seed(
      page,
      envelope(vikunjaIntegration(), [
        task({ id: 'local-1', title: 'Todo from before the integration' }),
        task({ id: 'local-2', title: 'Another local todo', status: 'inprogress' }),
      ]),
    )
    await waitForPermissionBanner(page)
    await openSettings(page)
    await page.getByTestId(TestId.TodoImportAction).click()
    const importDialog = page.getByTestId(TestId.TodoImportDialog)
    await expect(importDialog).toBeVisible()
    await snapshot(importDialog, `vikunja-import-dialog${suffix}.png`)
    await closeDialog(page, importDialog)
    await closeDialog(page, settingsDialog(page))
  })
}

test('vikunja settings and error screens match snapshots', async () => {
  const context = await launchExtensionContext()
  let opened: Page | null = null

  try {
    const page = await context.newPage()
    opened = page
    await prepareExtensionPage(page)
    await setExtensionTheme(page, 'light')
    await captureVikunjaScenarios(page, '')
    // Closed before the dark run: two open New Tab pages share the same
    // storage, and the one left behind would answer the next run's
    // `storage.onChanged` with a sync of its own.
    await page.close()

    const darkPage = await context.newPage()
    opened = darkPage
    await prepareExtensionPage(darkPage)
    await setExtensionTheme(darkPage, 'dark')
    await captureVikunjaScenarios(darkPage, '-dark')
  } finally {
    // The seeded envelope would otherwise resurrect a connected integration
    // for whatever spec reuses this profile.
    if (opened) await clearExtensionStorage(opened)
    await context.close()
  }
})
