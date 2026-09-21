import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/chrome/tabs.ts', () => ({
  focusOrOpenTab: vi.fn(async () => {}),
}))

// The sync engine touches storage on import; keep it inert. Nothing here is
// about persistence — the envelope is built from the store's own slice below.
vi.mock('@/services/chrome/storage.ts', () => ({
  getArea: vi.fn(async () => null),
  setArea: vi.fn(async () => true),
  removeArea: vi.fn(async () => {}),
  getLocal: vi.fn(async () => null),
  setLocal: vi.fn(async () => true),
}))

const bridgeMock = vi.hoisted(() => vi.fn())

// The **real** Vikunja descriptor, with only its transport faked: that is the
// point of this file. A fake descriptor would answer with whatever shape the
// test invented, and the regression it guards against is precisely the real
// descriptor's `withScope`/`withBoardState` not being called.
vi.mock('@/widgets/Todo/integrations/vikunja/bridge.ts', () => ({
  sendVikunjaMessage: bridgeMock,
}))

import { readVikunjaScheduleFrom } from '@/background/vikunja/alarm.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'

import type { RemoteContainer, StatusListMapping } from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaBoard, VikunjaConfig } from '@/widgets/Todo/store/store.ts'

/**
 * The wizard's whole path — connect, pick a project, save a mapping — against
 * the real descriptor, and then the worker's own reading of what it left
 * behind.
 *
 * This is the regression: the boards list was introduced with nothing writing
 * to it, so a *fresh* connection persisted `boards: [{ … mapping: null }]`
 * while the mapping went only to the slice. Everything on screen looked
 * right; the background pull, which reads the board, quietly never scheduled.
 */

const CONFIG: VikunjaConfig = {
  baseUrl: 'https://vikunja.example',
  token: 'tk_not-a-real-token',
  boards: [],
  defaultProjectId: null,
}

const CONTAINERS: RemoteContainer[] = [
  { id: '1', name: 'To-Do', isDefault: true },
  { id: '3', name: 'Done', isTerminal: true },
]

const MAPPING: StatusListMapping = {
  input: ['1'],
  inprogress: ['1'],
  struggle: ['1'],
  completed: ['3'],
  deleted: ['1'],
}

/** The record `withChromeSync` would write for the current store state. */
function envelope() {
  const { tasks, integration } = useTodoStore.getState()
  return {
    meta: { originId: 'test', rev: 1, ts: 1_700_000_000_000 },
    state: { tasks, integration },
  }
}

function vikunjaConfig(): VikunjaConfig {
  const integration = useTodoStore.getState().integration
  if (integration?.name !== 'vikunja') throw new Error('expected a connected vikunja integration')
  return integration.config
}

function boards(): VikunjaBoard[] {
  return vikunjaConfig().boards
}

/**
 * Connect → pick the project → save the mapping, as the wizard does.
 *
 * The picker hands over an *empty* project list on purpose: that is what a
 * fresh connection really reads, because its own boards are its projects and
 * the one being picked is not in the config yet. Re-deriving them is the
 * store's job (see the test below).
 */
async function runWizard() {
  await useTodoStore.getState().connectIntegration('vikunja', CONFIG)
  await useTodoStore.getState().pickScope({ projectId: 1, viewId: 4 }, 'Probe', CONTAINERS, [])
  await useTodoStore.getState().setMapping(MAPPING)
}

beforeEach(() => {
  bridgeMock.mockReset()
  // `connect` succeeds; everything else (the sync `setMapping` kicks off)
  // fails, because no instance is reachable from a unit test.
  bridgeMock.mockImplementation(async (request: { op: string }) =>
    request.op === 'connect'
      ? { ok: true, value: { userHandle: 'probe', version: 'v2.6.0' } }
      : { ok: false, errorKey: 'network' },
  )
  useTodoStore.setState({
    tasks: [],
    integration: null,
    errorKey: null,
    loading: false,
    conflictTaskIds: [],
  })
})

describe('a fresh Vikunja connection fills the board it just created', () => {
  it('writes the picked project and view into config.boards', async () => {
    await runWizard()

    expect(boards()).toHaveLength(1)
    expect(boards()[0]).toMatchObject({ projectId: 1, viewId: 4 })
    expect(vikunjaConfig().defaultProjectId).toBe(1)
  })

  it('writes the name and the containers the picker read', async () => {
    await runWizard()

    expect(boards()[0].name).toBe('Probe')
    expect(boards()[0].containers).toStrictEqual(CONTAINERS)
  })

  it('writes the mapping the wizard saved', async () => {
    await runWizard()

    expect(boards()[0].mapping).toStrictEqual(MAPPING)
  })

  it('leaves the single-board slice fields empty', async () => {
    await runWizard()

    // They are dead for this backend (task 2): the board holds all three, and
    // a second copy nobody updates is one a later reader would trust by
    // mistake.
    const integration = useTodoStore.getState().integration
    expect(integration?.boardName).toBeNull()
    expect(integration?.lists).toStrictEqual([])
    expect(integration?.mapping).toBeNull()
  })

  it('re-derives the projects from the config the pick produced', async () => {
    await runWizard()

    // The picker asked an adapter built *before* the pick, which for this
    // backend could only answer with the boards it already had — none. The
    // store asks again afterwards, so the board the user chose is available
    // as the project a new task goes to.
    expect(useTodoStore.getState().integration?.projects).toStrictEqual([
      { id: '1', name: 'Probe', pillClassName: expect.any(String) },
    ])
  })

  it('leaves the worker a schedule it can actually pull', async () => {
    await runWizard()

    // Reading the board, not the slice — which is why the mapping has to be
    // on the board. This returned `null` for every fresh connection before
    // `withBoardState` existed.
    expect(readVikunjaScheduleFrom(envelope())).toEqual({
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
      boards: [{ projectId: 1, viewId: 4 }],
      periodMin: 5,
    })
  })

  it('gives the worker nothing while the mapping step is unfinished', async () => {
    await useTodoStore.getState().connectIntegration('vikunja', CONFIG)
    await useTodoStore.getState().pickScope({ projectId: 1, viewId: 4 }, 'Probe', CONTAINERS, [])

    expect(boards()[0].mapping).toBeNull()
    expect(readVikunjaScheduleFrom(envelope())).toBeNull()
  })

  it('re-picking a project moves the board, its columns and its mapping', async () => {
    await runWizard()

    await useTodoStore
      .getState()
      .pickScope({ projectId: 8, viewId: 21 }, 'Work', [{ id: '9', name: 'Later' }], [])

    // The second board is the one being synced now, and the mapping of the
    // first one is not its mapping.
    expect(vikunjaConfig().defaultProjectId).toBe(8)
    expect(boards()).toHaveLength(2)
    expect(boards()[0].mapping).toStrictEqual(MAPPING)
    expect(boards()[1]).toMatchObject({
      projectId: 8,
      viewId: 21,
      name: 'Work',
      containers: [{ id: '9', name: 'Later' }],
      mapping: null,
    })
    // The worker keeps pulling the board that *is* mapped, and leaves the
    // freshly picked one alone until its wizard is finished — a tick reads
    // every mapped board now, not "the default" one.
    expect(readVikunjaScheduleFrom(envelope())?.boards).toStrictEqual([{ projectId: 1, viewId: 4 }])
  })

  it('refreshed containers land on the board, and only there', async () => {
    await runWizard()
    const created: RemoteContainer[] = [...CONTAINERS, { id: '5', name: 'Blocked' }]
    bridgeMock.mockImplementation(async (request: { op: string }) => {
      if (request.op === 'listBuckets') {
        return {
          ok: true,
          value: created.map((container) => ({
            id: Number(container.id),
            title: container.name,
            isDone: container.isTerminal === true,
            isDefault: container.isDefault === true,
          })),
        }
      }
      return { ok: false, errorKey: 'network' }
    })

    await expect(useTodoStore.getState().refreshContainers()).resolves.toBe(true)

    expect(boards()[0].containers).toStrictEqual(created)
    expect(useTodoStore.getState().integration?.lists).toStrictEqual([])
    // The mapping the user is about to extend must survive a refresh.
    expect(boards()[0].mapping).toStrictEqual(MAPPING)
  })
})

describe('a backend without per-board state is untouched by the hook', () => {
  it('keeps the Trello config exactly as the descriptor wrote it', async () => {
    useTodoStore.setState({
      integration: {
        name: 'trello',
        config: { apiKey: 'k', token: 't', boardId: 'board-1' },
        boardName: 'Board',
        lists: [{ id: 'l1', name: 'Inbox' }],
        projects: [],
        mapping: null,
        lastSyncAt: null,
      },
    })

    await useTodoStore.getState().pickScope({ boardId: 'board-9' }, 'Other', [], [])

    // Trello implements no `withBoardState`, so the only thing that touched
    // its config is its own `withScope`.
    expect(useTodoStore.getState().integration?.config).toStrictEqual({
      apiKey: 'k',
      token: 't',
      boardId: 'board-9',
    })
  })
})
