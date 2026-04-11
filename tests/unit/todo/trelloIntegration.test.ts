import { TrelloIntegration } from '@/widgets/Todo/integrations/trello/index.ts'
import type { TrelloCard } from '@/widgets/Todo/integrations/trello/schema.ts'
import type {
  IntegrationOutcome,
  PullContext,
  PushContext,
  RemoteTaskRef,
} from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'
import {
  hiddenMetadataFixture,
  listMappingFixture,
  trelloBoardFixture,
  trelloCardFixture,
  trelloCardWithCorruptMetadataFixture,
  trelloCardWithoutMetadataFixture,
  trelloLabelsFixture,
  trelloListsFixture,
  trelloMemberFixture,
} from '@tests/fixtures/trello.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fakeGetMe = vi.hoisted(() => vi.fn())
const fakeGetMyBoards = vi.hoisted(() => vi.fn())
const fakeGetBoardLists = vi.hoisted(() => vi.fn())
const fakeGetBoardLabels = vi.hoisted(() => vi.fn())
const fakeGetBoardCards = vi.hoisted(() => vi.fn())
const fakeCreateCard = vi.hoisted(() => vi.fn())
const fakeUpdateCard = vi.hoisted(() => vi.fn())

vi.mock('@/widgets/Todo/integrations/trello/client.ts', () => ({
  TrelloClient: class {
    getMe = fakeGetMe
    getMyBoards = fakeGetMyBoards
    getBoardLists = fakeGetBoardLists
    getBoardLabels = fakeGetBoardLabels
    getBoardCards = fakeGetBoardCards
    createCard = fakeCreateCard
    updateCard = fakeUpdateCard
  },
}))

function ok<T>(value: T): IntegrationOutcome<T> {
  return { ok: true, value }
}

function makeIntegration() {
  return new TrelloIntegration({ apiKey: 'k', token: 't', boardId: 'board-1' })
}

function makeTask(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: 'task-local-1',
    title: 'Local task',
    description: 'desc',
    status: 'input',
    projectId: null,
    createdAt: 1,
    statusChangedAt: 2,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
    ...overrides,
  }
}

const pullCtx: PullContext = {
  boardId: 'board-1',
  mapping: listMappingFixture,
  knownRefs: {},
}

const pushCtx: PushContext = {
  boardId: 'board-1',
  mapping: listMappingFixture,
  knownRef: null,
}

beforeEach(() => {
  fakeGetMe.mockReset()
  fakeGetMyBoards.mockReset()
  fakeGetBoardLists.mockReset()
  fakeGetBoardLabels.mockReset()
  fakeGetBoardCards.mockReset()
  fakeCreateCard.mockReset()
  fakeUpdateCard.mockReset()
})

describe('TrelloIntegration.connect', () => {
  it('returns userHandle on success', async () => {
    fakeGetMe.mockResolvedValueOnce(ok(trelloMemberFixture))
    const integration = makeIntegration()
    const out = await integration.connect()
    expect(out).toEqual({ ok: true, value: { userHandle: trelloMemberFixture.username } })
  })

  it('propagates client error outcomes unchanged', async () => {
    fakeGetMe.mockResolvedValueOnce({ ok: false, errorKey: 'authInvalid' })
    const out = await makeIntegration().connect()
    expect(out).toEqual({ ok: false, errorKey: 'authInvalid' })
  })
})

describe('TrelloIntegration.disconnect', () => {
  it('is a no-op that returns void without throwing', () => {
    const integration = makeIntegration()
    expect(() => integration.disconnect()).not.toThrow()
    expect(integration.disconnect()).toBeUndefined()
  })
})

describe('TrelloIntegration list helpers', () => {
  it('listBoards maps client.getMyBoards to RemoteBoard[]', async () => {
    fakeGetMyBoards.mockResolvedValueOnce(ok([trelloBoardFixture]))
    const out = await makeIntegration().listBoards()
    expect(out).toEqual({
      ok: true,
      value: [{ id: trelloBoardFixture.id, name: trelloBoardFixture.name }],
    })
  })

  it('listLists maps client.getBoardLists to RemoteList[]', async () => {
    fakeGetBoardLists.mockResolvedValueOnce(ok(trelloListsFixture))
    const out = await makeIntegration().listLists('board-1')
    expect(fakeGetBoardLists).toHaveBeenCalledWith('board-1')
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.value).toEqual(
        trelloListsFixture.map((list) => ({ id: list.id, name: list.name })),
      )
    }
  })

  it('listProjects maps client.getBoardLabels via labelToProject', async () => {
    fakeGetBoardLabels.mockResolvedValueOnce(ok(trelloLabelsFixture))
    const out = await makeIntegration().listProjects('board-1')
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.value).toHaveLength(trelloLabelsFixture.length)
      expect(out.value[0]).toMatchObject({ id: 'label-green', name: 'Feature' })
      // green hue resolves to emerald-* class
      expect(out.value[0].pillClassName).toContain('emerald')
      // unknown / null colors fall back to muted
      expect(out.value[3].pillClassName).toContain('bg-muted')
    }
  })

  it('list helpers propagate client errors unchanged', async () => {
    fakeGetMyBoards.mockResolvedValueOnce({ ok: false, errorKey: 'network' })
    const out = await makeIntegration().listBoards()
    expect(out).toEqual({ ok: false, errorKey: 'network' })
  })
})

describe('TrelloIntegration.pullTasks', () => {
  it('maps each card via cardToTask when knownRefs is empty', async () => {
    fakeGetBoardCards.mockResolvedValueOnce(ok([trelloCardFixture()]))
    const out = await makeIntegration().pullTasks(pullCtx)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.value.tasks).toHaveLength(1)
      // valid metadata → uses meta.localId
      expect(out.value.tasks[0].id).toBe(hiddenMetadataFixture.localId)
      expect(out.value.refs[hiddenMetadataFixture.localId]).toBeDefined()
    }
  })

  it('preserves the local id via existingId for cards matched by cardId', async () => {
    fakeGetBoardCards.mockResolvedValueOnce(ok([trelloCardWithoutMetadataFixture]))
    const knownRefs: Record<string, RemoteTaskRef> = {
      'local-known-id': {
        cardId: trelloCardWithoutMetadataFixture.id,
        shortLink: null,
        listId: 'list-input',
        etag: null,
      },
    }
    const out = await makeIntegration().pullTasks({ ...pullCtx, knownRefs })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.value.tasks[0].id).toBe('local-known-id')
    }
  })

  it('does not throw on cards with corrupt hidden metadata', async () => {
    fakeGetBoardCards.mockResolvedValueOnce(ok([trelloCardWithCorruptMetadataFixture]))
    const out = await makeIntegration().pullTasks({
      ...pullCtx,
      knownRefs: {
        'local-fallback-id': {
          cardId: trelloCardWithCorruptMetadataFixture.id,
          shortLink: null,
          listId: 'list-input',
          etag: null,
        },
      },
    })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.value.tasks[0].id).toBe('local-fallback-id')
      expect(out.value.tasks[0].description).toBe('User text')
    }
  })

  it('propagates client errors unchanged', async () => {
    fakeGetBoardCards.mockResolvedValueOnce({ ok: false, errorKey: 'pullFailed' })
    const out = await makeIntegration().pullTasks(pullCtx)
    expect(out).toEqual({ ok: false, errorKey: 'pullFailed' })
  })

  // FIXME: pins current behavior — cards deleted on Trello silently disappear
  // from the local store on next pull. See it.todo() below.
  it('returns only the cards Trello sent (deleted-on-remote cards drop out silently)', async () => {
    fakeGetBoardCards.mockResolvedValueOnce(ok([])) // remote returns nothing
    const out = await makeIntegration().pullTasks({
      ...pullCtx,
      knownRefs: {
        'local-orphan': {
          cardId: 'card-that-was-deleted-on-remote',
          shortLink: null,
          listId: 'list-input',
          etag: null,
        },
      },
    })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.value.tasks).toEqual([])
      expect(out.value.refs).toEqual({})
    }
  })

  it.todo('should mark cards removed-on-remote as locally deleted instead of dropping them')
})

describe('TrelloIntegration.pushTask', () => {
  function captureCardResponse(overrides: Partial<TrelloCard> = {}): TrelloCard {
    return trelloCardFixture({
      id: 'card-remote-1',
      shortLink: 'link-remote',
      idList: 'list-input',
      dateLastActivity: '2024-02-01T00:00:00.000Z',
      ...overrides,
    })
  }

  it('routes "create" to client.createCard with description from buildCardDescription', async () => {
    fakeCreateCard.mockResolvedValueOnce(ok(captureCardResponse()))
    const task = makeTask({ status: 'inprogress', projectId: 'label-green' })
    const out = await makeIntegration().pushTask(task, { kind: 'create' }, pushCtx)
    expect(out.ok).toBe(true)
    expect(fakeCreateCard).toHaveBeenCalledOnce()
    const payload = fakeCreateCard.mock.calls[0][0]
    // primary list for inprogress
    expect(payload.idList).toBe('list-inprogress')
    expect(payload.idLabels).toEqual(['label-green'])
    expect(payload.name).toBe('Local task')
    // hidden metadata is appended
    expect(payload.desc).toContain('<!-- newtab-todo:v1')
    expect(payload.desc.startsWith('desc')).toBe(true)
  })

  it('"create" returns a remoteRef built from the response', async () => {
    fakeCreateCard.mockResolvedValueOnce(ok(captureCardResponse()))
    const out = await makeIntegration().pushTask(
      makeTask(),
      { kind: 'create' },
      pushCtx,
    )
    if (!out.ok) throw new Error('expected ok')
    expect(out.value).toEqual({
      cardId: 'card-remote-1',
      shortLink: 'link-remote',
      listId: 'list-input',
      etag: '2024-02-01T00:00:00.000Z',
    })
  })

  it('routes "update" with an existing remoteRef to client.updateCard', async () => {
    fakeUpdateCard.mockResolvedValueOnce(ok(captureCardResponse()))
    const task = makeTask({
      remoteRef: {
        cardId: 'remote-cid-7',
        shortLink: null,
        listId: 'list-input',
        etag: null,
      },
    })
    const ctx: PushContext = { ...pushCtx, knownRef: task.remoteRef }
    const out = await makeIntegration().pushTask(task, { kind: 'update' }, ctx)
    expect(out.ok).toBe(true)
    expect(fakeUpdateCard).toHaveBeenCalledOnce()
    expect(fakeUpdateCard.mock.calls[0][0]).toBe('remote-cid-7')
    const patch = fakeUpdateCard.mock.calls[0][1]
    expect(patch.name).toBe('Local task')
    expect(patch.desc).toContain('<!-- newtab-todo:v1')
    // plain "update" doesn't change idList or idLabels
    expect(patch.idList).toBeUndefined()
    expect(patch.idLabels).toBeUndefined()
  })

  it('"status" updates idList to the primary of the new status', async () => {
    fakeUpdateCard.mockResolvedValueOnce(ok(captureCardResponse({ idList: 'list-struggle' })))
    const task = makeTask({
      status: 'struggle',
      remoteRef: {
        cardId: 'remote-cid-8',
        shortLink: null,
        listId: 'list-input',
        etag: null,
      },
    })
    await makeIntegration().pushTask(
      task,
      { kind: 'status', previous: 'input' },
      { ...pushCtx, knownRef: task.remoteRef },
    )
    const patch = fakeUpdateCard.mock.calls[0][1]
    expect(patch.idList).toBe('list-struggle')
  })

  it('"delete" updates idList to the primary of the deleted status', async () => {
    fakeUpdateCard.mockResolvedValueOnce(ok(captureCardResponse({ idList: 'list-deleted' })))
    const task = makeTask({
      status: 'deleted',
      remoteRef: {
        cardId: 'remote-cid-9',
        shortLink: null,
        listId: 'list-input',
        etag: null,
      },
    })
    await makeIntegration().pushTask(
      task,
      { kind: 'delete' },
      { ...pushCtx, knownRef: task.remoteRef },
    )
    expect(fakeUpdateCard.mock.calls[0][1].idList).toBe('list-deleted')
  })

  it('"project" updates idLabels (single label when projectId set)', async () => {
    fakeUpdateCard.mockResolvedValueOnce(ok(captureCardResponse()))
    const task = makeTask({
      projectId: 'label-green',
      remoteRef: {
        cardId: 'remote-cid-10',
        shortLink: null,
        listId: 'list-input',
        etag: null,
      },
    })
    await makeIntegration().pushTask(
      task,
      { kind: 'project', previous: null },
      { ...pushCtx, knownRef: task.remoteRef },
    )
    expect(fakeUpdateCard.mock.calls[0][1].idLabels).toEqual(['label-green'])
  })

  it('"project" with null projectId clears idLabels to []', async () => {
    fakeUpdateCard.mockResolvedValueOnce(ok(captureCardResponse()))
    const task = makeTask({
      projectId: null,
      remoteRef: {
        cardId: 'remote-cid-11',
        shortLink: null,
        listId: 'list-input',
        etag: null,
      },
    })
    await makeIntegration().pushTask(
      task,
      { kind: 'project', previous: 'label-green' },
      { ...pushCtx, knownRef: task.remoteRef },
    )
    expect(fakeUpdateCard.mock.calls[0][1].idLabels).toEqual([])
  })

  it('falls through to createCard when op is "update" but task has no remoteRef', async () => {
    // pushTask early-returns to createCard if remoteRef is missing, regardless of op kind.
    fakeCreateCard.mockResolvedValueOnce(ok(captureCardResponse()))
    const out = await makeIntegration().pushTask(
      makeTask({ remoteRef: null }),
      { kind: 'update' },
      pushCtx,
    )
    expect(out.ok).toBe(true)
    expect(fakeCreateCard).toHaveBeenCalledOnce()
    expect(fakeUpdateCard).not.toHaveBeenCalled()
  })

  it('propagates client errors from createCard', async () => {
    fakeCreateCard.mockResolvedValueOnce({ ok: false, errorKey: 'rateLimited' })
    const out = await makeIntegration().pushTask(makeTask(), { kind: 'create' }, pushCtx)
    expect(out).toEqual({ ok: false, errorKey: 'rateLimited' })
  })

  it('propagates client errors from updateCard', async () => {
    fakeUpdateCard.mockResolvedValueOnce({ ok: false, errorKey: 'pushFailed' })
    const task = makeTask({
      remoteRef: {
        cardId: 'remote-cid-err',
        shortLink: null,
        listId: 'list-input',
        etag: null,
      },
    })
    const out = await makeIntegration().pushTask(
      task,
      { kind: 'update' },
      { ...pushCtx, knownRef: task.remoteRef },
    )
    expect(out).toEqual({ ok: false, errorKey: 'pushFailed' })
  })
})
