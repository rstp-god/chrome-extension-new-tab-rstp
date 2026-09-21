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

/** An envelope written by a Vikunja-connected build (kanban mapping on). */
export function makeVikunjaEnvelope(): RawTodoEnvelope {
  return {
    meta: { originId: 'origin-vikunja-device', rev: 4, ts: BASE_TS + 7_200_000 },
    state: {
      tasks: [
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
          remoteRef: {
            taskId: 42,
            identifier: '#42',
            bucketId: 8,
            updated: '2024-08-19T12:34:56Z',
          },
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
          remoteRef: {
            taskId: 43,
            identifier: 'PROJ-43',
            bucketId: null,
            updated: '2024-08-20T09:00:00Z',
          },
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
      ],
      integration: {
        name: 'vikunja',
        config: {
          baseUrl: 'https://vikunja.example.com',
          token: 'tk_vikunja',
          projectId: 3,
          viewId: 11,
          kanbanMapping: true,
        },
        boardName: 'Personal project',
        lists: [
          { id: '8', name: 'Doing' },
          { id: '9', name: 'Backlog' },
          { id: '10', name: 'Done' },
        ],
        projects: [{ id: 'label-7', name: 'Urgent', pillClassName: null }],
        mapping: {
          input: ['9'],
          inprogress: ['8'],
          struggle: ['8'],
          completed: ['10'],
          deleted: ['10'],
        },
        lastSyncAt: BASE_TS + 7_200_000,
      },
    },
  }
}
