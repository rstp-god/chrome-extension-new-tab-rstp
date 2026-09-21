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
 * form, the boards step, the bucket wizard walked per board, the summary of a
 * connection that syncs two of them, the lost-permission banner and the
 * local-task import.
 *
 * **Nothing here touches a network.** Every state is seeded by writing the
 * widget's own envelope into `chrome.storage.local` and reloading — the same
 * trick `tests/extension/vikunjaBridge.spec.ts` uses — so the settings dialog
 * computes its step from persisted state exactly as it would for a real user.
 * The host below is never granted to the extension, which is precisely why
 * the summary scenarios also show the permission failure: a mounted widget
 * with a finished mapping syncs once, the worker's permission gate refuses
 * it, and that is the honest state of a widget whose instance it cannot
 * reach. The boards step is the same fact seen from the other side — it opens
 * on a `listScopes` that will never be answered.
 *
 * The seeds are the **multi-board** shape (`config.boards` +
 * `config.defaultProjectId`), with exactly one deliberate exception:
 * `vikunja-permission-banner` still seeds the **single-board** envelope, the
 * bytes a real user has on disk when this build first opens their New Tab.
 * That scenario is therefore the end-to-end check of
 * `upgradePersistedState` — the page has to move the config's scope and the
 * slice's mapping onto a board, stamp every task's ref with the `projectId`
 * the seed below deliberately omits, and still render the very same widget.
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

/** One board of a multi-board config, as `vikunjaBoardSchema` wants it. */
interface RawBoard {
  projectId: number
  viewId: number
  name: string
  containers: { id: string; name: string; isDefault?: boolean; isTerminal?: boolean }[]
  mapping: Record<string, string[]> | null
  kanbanMapping: boolean
}

/** Fictional instance, never granted — see the note above. */
const CONNECTION = {
  baseUrl: 'https://vikunja.example',
  token: 'tk_not-a-real-token',
}

/** A three-column board: no bucket for `struggle` or `deleted`. */
const INBOX_LISTS = [
  { id: '1', name: 'To-Do', isDefault: true },
  { id: '2', name: 'Doing' },
  { id: '3', name: 'Done', isTerminal: true },
]

/**
 * The second board's columns: the same three names — two boards built from
 * one template is the case "Same as …" exists for — with that board's own
 * bucket ids, because a bucket id belongs to a view and never to two.
 */
const WORK_LISTS = [
  { id: '11', name: 'To-Do', isDefault: true },
  { id: '12', name: 'Doing' },
  { id: '13', name: 'Done', isTerminal: true },
]

const INBOX_MAPPING = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['2'],
  completed: ['3'],
  deleted: ['2'],
}

const WORK_MAPPING = {
  input: ['11'],
  inprogress: ['12'],
  struggle: ['12'],
  completed: ['13'],
  deleted: ['12'],
}

/** Flat mode: everything but `completed` points at the default bucket. */
const WORK_FLAT_MAPPING = {
  input: ['11'],
  inprogress: ['11'],
  struggle: ['11'],
  completed: ['13'],
  deleted: ['11'],
}

const INBOX_BOARD: RawBoard = {
  projectId: 1,
  viewId: 4,
  name: 'Inbox',
  containers: INBOX_LISTS,
  mapping: INBOX_MAPPING,
  kanbanMapping: true,
}

const WORK_BOARD: RawBoard = {
  projectId: 2,
  viewId: 8,
  name: 'Работа',
  containers: WORK_LISTS,
  mapping: WORK_MAPPING,
  kanbanMapping: true,
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

/**
 * A Vikunja ref **without** a `projectId` — the shape the single-board build
 * wrote, and the one the upgrade has to repair. Used only by the legacy
 * scenario; a ref that reached the new schema unrepaired would fail it and
 * degrade to `null`, turning a linked task into a local one.
 */
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

/**
 * The current integration slice: everything about a board lives on the board,
 * and `boardName` / `lists` / `mapping` are the dead fields the store now
 * writes empty (see `vikunjaIntegrationSchema`).
 *
 * `projects` mirrors the boards, because for this backend the widget's
 * projects *are* its boards — that cache is what the summary and the import
 * dialog name the destination from.
 */
function vikunjaIntegration(
  boards: RawBoard[],
  configOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: 'vikunja',
    config: {
      ...CONNECTION,
      boards,
      defaultProjectId: boards[0]?.projectId ?? null,
      ...configOverrides,
    },
    boardName: null,
    lists: [],
    projects: boards.map((board) => ({
      id: String(board.projectId),
      name: board.name,
      pillClassName: null,
    })),
    mapping: null,
    lastSyncAt: null,
  }
}

/**
 * The slice as the **single-board** build wrote it: the scope inside the
 * config, the board's name, columns and mapping on the slice itself. Seeded
 * by one scenario on purpose — see the note at the top of the file.
 */
function legacyVikunjaIntegration(): Record<string, unknown> {
  return {
    name: 'vikunja',
    config: { ...CONNECTION, projectId: 1, viewId: 4, kanbanMapping: true },
    boardName: 'Inbox',
    lists: INBOX_LISTS,
    projects: [],
    mapping: INBOX_MAPPING,
    // `null` keeps the summary's "last sync" line at a fixed word.
    lastSyncAt: null,
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

  await test.step(`Boards step${suffix}`, async () => {
    // Reached the way a user reaches it once the connection is settled: from
    // the summary's "Change boards".
    await seed(page, envelope(vikunjaIntegration([INBOX_BOARD, WORK_BOARD])))
    await waitForPermissionBanner(page)
    await openSettings(page)
    await page.getByRole('button', { name: 'Change boards' }).click()

    const boardsStep = page.getByTestId(TestId.TodoBoardsStep)
    await expect(boardsStep).toBeVisible()
    // The account's project list is one more request the withdrawn host
    // refuses, so the step never leaves its skeleton behind a `listScopes`
    // that resolves — it falls back to the boards the config already carries.
    // Waiting for the skeleton to go is what makes the picture stable; the
    // rows below it are the point of the screenshot.
    await expect(boardsStep.getByText('Reading the projects…')).toBeHidden()
    await expect(boardsStep.getByText('Inbox')).toBeVisible()
    await expect(boardsStep.getByText('Работа')).toBeVisible()
    await expect(boardsStep.getByRole('alert')).toContainText('lost permission')
    await snapshot(settingsDialog(page), `vikunja-boards-step${suffix}.png`)
    await closeDialog(page, settingsDialog(page))
  })

  await test.step(`Bucket mapping wizard${suffix}`, async () => {
    // Two boards, the second one never mapped → the dialog opens on the
    // wizard and the widget makes no sync at all (`getSetupStep` answers
    // `'mapping'` while *any* board is unmapped).
    await seed(page, envelope(vikunjaIntegration([INBOX_BOARD, { ...WORK_BOARD, mapping: null }])))
    await openSettings(page)
    const mappingStep = page.getByTestId(TestId.TodoMappingStep)
    await expect(mappingStep).toBeVisible()
    // One board in the queue, two in the connection: the header still names
    // which board this is, because "the" mapping stopped being a thing.
    await expect(mappingStep).toContainText('Board 1 of 1 — Работа')
    // The other board is mapped and uses its buckets, so it can be copied
    // from — by column name, since the ids are per board.
    await expect(mappingStep.getByRole('button', { name: 'Same as Inbox' })).toBeVisible()
    // The board has no struggle/trash column, so the wizard offers to build
    // them — and offers flat mode as the way out either way.
    await expect(page.getByTestId(TestId.TodoMissingColumnsPanel)).toBeVisible()
    await expect(page.getByTestId(TestId.TodoFlatModeSection)).toBeVisible()
    await snapshot(settingsDialog(page), `vikunja-mapping-wizard${suffix}.png`)
    await closeDialog(page, settingsDialog(page))
  })

  await test.step(`Flat-mode summary${suffix}`, async () => {
    // One kanban board and one flat board on the same connection: the badges
    // say which is which, the star says where new tasks go, and the notice is
    // stated once for the connection.
    await seed(
      page,
      envelope(
        vikunjaIntegration([
          INBOX_BOARD,
          { ...WORK_BOARD, mapping: WORK_FLAT_MAPPING, kanbanMapping: false },
        ]),
      ),
    )
    await waitForPermissionBanner(page)
    await openSettings(page)
    const boardsList = page.getByTestId(TestId.TodoSummaryBoard)
    await expect(boardsList).toContainText('Inbox')
    await expect(boardsList).toContainText('Работа')
    // The block the flat mode is *about*: the notice plus the statuses that
    // never leave the extension.
    await expect(page.getByTestId(TestId.TodoSummaryFlatMode)).toBeVisible()
    await snapshot(settingsDialog(page), `vikunja-flat-mode${suffix}.png`)
    await closeDialog(page, settingsDialog(page))
  })

  await test.step(`Lost-permission banner${suffix}`, async () => {
    // **The single-board seed** — the one scenario deliberately left on the
    // old shape. Rendering this widget at all means `upgradePersistedState`
    // built the board out of the config and the slice, and gave every ref
    // below the `projectId` it was written without.
    await seed(
      page,
      envelope(legacyVikunjaIntegration(), [
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
    // `defaultProjectId` names the *second* board, so the dialog naming
    // "Работа" is the proof it asks the project policy where a new task goes
    // rather than taking whichever board is first.
    await seed(
      page,
      envelope(vikunjaIntegration([INBOX_BOARD, WORK_BOARD], { defaultProjectId: 2 }), [
        task({ id: 'local-1', title: 'Todo from before the integration' }),
        task({ id: 'local-2', title: 'Another local todo', status: 'inprogress' }),
      ]),
    )
    await waitForPermissionBanner(page)
    await openSettings(page)
    await page.getByTestId(TestId.TodoImportAction).click()
    const importDialog = page.getByTestId(TestId.TodoImportDialog)
    await expect(importDialog).toBeVisible()
    await expect(importDialog).toContainText('Работа')
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
