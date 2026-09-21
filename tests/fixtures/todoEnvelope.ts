/**
 * Raw `chrome.storage.local` records for the Todo widget.
 *
 * Deliberately typed as loose records rather than as `TodoTask` /
 * `IntegrationState`: these stand for bytes that are already on a user's
 * disk, written by a build that only knew about Trello. Parsing them with
 * the current schema is what proves the two-integration union landed
 * without a migration.
 */

export interface RawTodoEnvelope {
  meta: { originId: string; rev: number; ts: number }
  state: {
    tasks: Record<string, unknown>[]
    integration: Record<string, unknown> | null
  }
}

const STATUS_CYCLE = ['input', 'inprogress', 'struggle', 'completed', 'deleted'] as const

const TRELLO_LIST_BY_STATUS: Record<string, string> = {
  input: 'list-inbox',
  inprogress: 'list-doing',
  struggle: 'list-blocked',
  completed: 'list-done',
  deleted: 'list-archive',
}

const BASE_TS = 1_724_000_000_000

/**
 * One persisted task as the Trello-only build wrote it. The index drives the
 * variation (status, missing description, linked tab, pre-integration tasks
 * with `remoteRef: null`) so a single loop produces a realistic spread.
 */
function trelloTask(index: number): Record<string, unknown> {
  const status = STATUS_CYCLE[index % STATUS_CYCLE.length]
  const createdAt = BASE_TS + index * 60_000
  // Every 5th task predates the integration: created locally, never pushed.
  const local = index % 5 === 4

  return {
    id: `task-${index}`,
    title: `Trello task ${index}`,
    description: index % 3 === 0 ? null : `Description of task ${index}`,
    status,
    projectId: index % 4 === 0 ? null : `label-${index % 3}`,
    createdAt,
    statusChangedAt: createdAt + 30_000,
    completedAt: status === 'completed' ? createdAt + 90_000 : null,
    deletedAt: status === 'deleted' ? createdAt + 120_000 : null,
    linkedTab:
      index % 3 === 1
        ? { url: `https://example.com/issues/${index}`, title: `Issue ${index}` }
        : null,
    remoteRef: local
      ? null
      : {
          cardId: `card-${index}`,
          shortLink: index % 2 === 0 ? `sl${index}` : null,
          listId: TRELLO_LIST_BY_STATUS[status],
          etag: `2024-08-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
        },
    syncState: local ? 'clean' : index % 7 === 3 ? 'dirty' : 'clean',
  }
}

/** Built per call so callers can mutate the returned envelope freely. */
function trelloIntegration(): Record<string, unknown> {
  return {
    name: 'trello',
    config: { apiKey: 'api-key-abc', token: 'token-xyz', boardId: 'board-1' },
    boardName: 'Personal board',
    lists: [
      { id: 'list-inbox', name: 'Inbox' },
      { id: 'list-doing', name: 'Doing' },
      { id: 'list-blocked', name: 'Blocked' },
      { id: 'list-done', name: 'Done' },
      { id: 'list-archive', name: 'Archive' },
      { id: 'list-someday', name: 'Someday' },
    ],
    projects: [
      { id: 'label-0', name: 'Home', pillClassName: 'bg-green-500/20 text-green-300' },
      { id: 'label-1', name: 'Work', pillClassName: null },
      { id: 'label-2', name: 'Side project', pillClassName: 'bg-sky-500/20 text-sky-300' },
    ],
    mapping: {
      input: ['list-inbox', 'list-someday'],
      inprogress: ['list-doing'],
      struggle: ['list-blocked'],
      completed: ['list-done'],
      deleted: ['list-archive'],
    },
    lastSyncAt: BASE_TS + 3_600_000,
  }
}

/**
 * A pre-Vikunja envelope: 22 tasks, a fully configured Trello integration.
 * Returns a fresh object every call so tests can mutate it in place.
 */
export function makeTrelloEnvelope(): RawTodoEnvelope {
  return {
    meta: { originId: 'origin-trello-device', rev: 17, ts: BASE_TS + 3_600_000 },
    state: {
      tasks: Array.from({ length: 22 }, (_, index) => trelloTask(index)),
      integration: trelloIntegration(),
    },
  }
}

/** The buckets of the view, with the backend's own terminal/default flags. */
const VIKUNJA_CONTAINERS = [
  { id: '8', name: 'Doing' },
  { id: '9', name: 'Backlog', isDefault: true },
  { id: '10', name: 'Done', isTerminal: true },
]

const VIKUNJA_MAPPING = {
  input: ['9'],
  inprogress: ['8'],
  struggle: ['8'],
  completed: ['10'],
  deleted: ['10'],
}

/**
 * The board every Vikunja fixture below is about, in the persisted
 * `boards[]` shape: the project, its kanban view, and the cached title,
 * buckets and mapping that used to live on the integration slice alone.
 */
function vikunjaBoard(): Record<string, unknown> {
  return {
    projectId: 3,
    viewId: 11,
    name: 'Personal project',
    containers: VIKUNJA_CONTAINERS,
    mapping: VIKUNJA_MAPPING,
    kanbanMapping: true,
  }
}

/**
 * A second board, so a fixture can show that the list is a list.
 *
 * It runs **flat**, which is not the same as unmapped: skipping the bucket
 * wizard still writes a full mapping (`flatModeMapping`) pointing every
 * non-terminal status at the view's default bucket and `completed` at its
 * done bucket. The persisted schema needs every row filled, and a board with
 * `mapping: null` is one whose wizard was never finished — which pauses the
 * sync for the whole connection, on the page and in the worker alike.
 */
function vikunjaSecondBoard(): Record<string, unknown> {
  return {
    projectId: 8,
    viewId: 21,
    name: 'Work',
    containers: [
      { id: '30', name: 'Todo', isDefault: true },
      { id: '31', name: 'Shipped', isTerminal: true },
    ],
    mapping: {
      input: ['30'],
      inprogress: ['30'],
      struggle: ['30'],
      completed: ['31'],
      deleted: ['30'],
    },
    kanbanMapping: false,
  }
}

/**
 * The three tasks the Vikunja fixtures carry: one linked and bucketed, one
 * linked in flat mode (`bucketId: null`), one never pushed.
 *
 * `refProjectId` is the field the multi-board schema added — `null` produces
 * the refs an older build wrote, which is what the upgrade has to fill in.
 */
function vikunjaTasks(refProjectId: number | null): Record<string, unknown>[] {
  const onBoard = (ref: Record<string, unknown>) =>
    refProjectId === null ? ref : { ...ref, projectId: refProjectId }

  return [
    {
      id: 'task-v-1',
      title: 'Vikunja task one',
      description: 'Pulled from bucket "Doing"',
      status: 'inprogress',
      projectId: 'label-7',
      createdAt: BASE_TS,
      statusChangedAt: BASE_TS + 60_000,
      completedAt: null,
      deletedAt: null,
      linkedTab: { url: 'https://vikunja.example.com/tasks/42', title: 'Task 42' },
      remoteRef: onBoard({
        taskId: 42,
        identifier: '#42',
        bucketId: 8,
        updated: '2024-08-19T12:34:56Z',
      }),
      syncState: 'clean',
    },
    {
      id: 'task-v-2',
      title: 'Vikunja task two',
      description: null,
      status: 'completed',
      projectId: null,
      createdAt: BASE_TS + 120_000,
      statusChangedAt: BASE_TS + 180_000,
      completedAt: BASE_TS + 180_000,
      deletedAt: null,
      linkedTab: null,
      // Flat mode: no bucket, hence `bucketId: null`.
      remoteRef: onBoard({
        taskId: 43,
        identifier: 'PROJ-43',
        bucketId: null,
        updated: '2024-08-20T09:00:00Z',
      }),
      syncState: 'dirty',
    },
    {
      id: 'task-v-3',
      title: 'Local-only task',
      description: null,
      status: 'input',
      projectId: null,
      createdAt: BASE_TS + 240_000,
      statusChangedAt: BASE_TS + 240_000,
      completedAt: null,
      deletedAt: null,
      linkedTab: null,
      remoteRef: null,
      syncState: 'clean',
    },
  ]
}

/**
 * An envelope in the current shape: one board in `config.boards`, and the
 * slice fields mirroring it (which is what the upgrade leaves behind and what
 * every reader in the widget still goes through).
 */
export function makeVikunjaEnvelope(): RawTodoEnvelope {
  const board = vikunjaBoard()

  return {
    meta: { originId: 'origin-vikunja-device', rev: 4, ts: BASE_TS + 7_200_000 },
    state: {
      tasks: vikunjaTasks(3),
      integration: {
        name: 'vikunja',
        config: {
          baseUrl: 'https://vikunja.example.com',
          token: 'tk_vikunja',
          boards: [board],
          defaultProjectId: 3,
        },
        boardName: 'Personal project',
        lists: VIKUNJA_CONTAINERS,
        projects: [{ id: 'label-7', name: 'Urgent', pillClassName: null }],
        mapping: VIKUNJA_MAPPING,
        lastSyncAt: BASE_TS + 7_200_000,
      },
    },
  }
}

/** Two boards, and a task linked to each of them. */
export function makeMultiBoardVikunjaEnvelope(): RawTodoEnvelope {
  const raw = makeVikunjaEnvelope()
  const integration = raw.state.integration as Record<string, unknown>
  integration.config = {
    baseUrl: 'https://vikunja.example.com',
    token: 'tk_vikunja',
    boards: [vikunjaBoard(), vikunjaSecondBoard()],
    defaultProjectId: 3,
    pullPeriodMin: 15,
  }
  // The second task lives on the second board.
  const second = raw.state.tasks[1].remoteRef as Record<string, unknown>
  second.projectId = 8

  return raw
}

/**
 * An envelope written by the single-board build: the scope and the mode sit
 * in the config, the cached title/buckets/mapping only on the slice, and no
 * ref knows which board it belongs to.
 *
 * `configOverrides` is how a test asks for the other single-board state that
 * existed — a connection that never picked a project (`projectId: null`).
 */
export function makeLegacyVikunjaEnvelope(
  configOverrides: Record<string, unknown> = {},
): RawTodoEnvelope {
  return {
    meta: { originId: 'origin-vikunja-device', rev: 4, ts: BASE_TS + 7_200_000 },
    state: {
      tasks: vikunjaTasks(null),
      integration: {
        name: 'vikunja',
        config: {
          baseUrl: 'https://vikunja.example.com',
          token: 'tk_vikunja',
          projectId: 1,
          viewId: 4,
          kanbanMapping: true,
          ...configOverrides,
        },
        boardName: 'Inbox',
        lists: VIKUNJA_CONTAINERS,
        projects: [{ id: 'label-7', name: 'Urgent', pillClassName: null }],
        mapping: VIKUNJA_MAPPING,
        lastSyncAt: BASE_TS + 7_200_000,
      },
    },
  }
}
