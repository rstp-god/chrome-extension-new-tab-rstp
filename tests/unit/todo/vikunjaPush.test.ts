import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  vikunjaCreatePayloadSchema,
  vikunjaUpdatePayloadSchema,
} from '@/background/vikunja/handlers.ts'
import {
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
} from '@/background/vikunja/messages.ts'
import { sendVikunjaMessage } from '@/widgets/Todo/integrations/vikunja/bridge.ts'
import { VikunjaIntegration } from '@/widgets/Todo/integrations/vikunja/index.ts'

import type { VikunjaRequest, VikunjaTaskWrite } from '@/background/vikunja/messages.ts'
import type {
  IntegrationOutcome,
  IntegrationPushOp,
  RemoteTaskRef,
  StatusListMapping,
  TodoIntegration,
  VikunjaRemoteRef,
} from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask, VikunjaBoard, VikunjaConfig } from '@/widgets/Todo/store/store.ts'

vi.mock('@/widgets/Todo/integrations/vikunja/bridge.ts', () => ({
  sendVikunjaMessage: vi.fn(),
}))

const bridge = vi.mocked(sendVikunjaMessage)

/** The board every push here happens on; `SCOPE` below is its pair. */
const BOARD: VikunjaBoard = {
  projectId: 1,
  viewId: 4,
  name: 'Probe',
  containers: [],
  mapping: null,
  kanbanMapping: true,
}

const CONFIG: VikunjaConfig = {
  baseUrl: 'https://vikunja.example',
  token: 'tk_super-secret-value',
  boards: [BOARD],
  defaultProjectId: 1,
}

const CFG = { baseUrl: CONFIG.baseUrl, token: CONFIG.token }

/** Bucket 3 is the view's done bucket — the only home `completed` may have. */
const MAPPING: StatusListMapping = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['5'],
  completed: ['3'],
  deleted: ['6'],
}

/**
 * Flat mode still needs a full mapping row per status (the persisted schema
 * demands one), and everything but `completed` points at the default bucket —
 * which the adapter must then ignore.
 */
const FLAT_MAPPING: StatusListMapping = {
  input: ['1'],
  inprogress: ['1'],
  struggle: ['1'],
  completed: ['3'],
  deleted: ['1'],
}

const ETAG = '2026-09-20T14:30:00.000Z'
const NEXT_ETAG = '2026-09-20T15:00:00.000Z'

function task(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: 'vikunja:4',
    title: 'Probe',
    description: null,
    status: 'input',
    projectId: null,
    createdAt: 1,
    statusChangedAt: 1,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: ref(),
    syncState: 'dirty',
    ...overrides,
  }
}

function ref(overrides: Partial<VikunjaRemoteRef> = {}): VikunjaRemoteRef {
  return { taskId: 4, projectId: 1, identifier: '#3', bucketId: 1, updated: ETAG, ...overrides }
}

function write(overrides: Partial<VikunjaTaskWrite> = {}): VikunjaTaskWrite {
  return {
    id: 4,
    identifier: '#3',
    // `0` is what a create or an edit really answers: only a view response
    // fills a task's `bucket_id` (recon Q3).
    bucketId: 0,
    done: false,
    doneAt: null,
    updated: NEXT_ETAG,
    ...overrides,
  }
}

/** Answers every op with `value`, or per-op from a table. */
function stubBridge(table: Partial<Record<VikunjaRequest['op'], unknown>>) {
  bridge.mockImplementation(async (request) => {
    const value = table[request.op]
    if (value === undefined) throw new Error(`unexpected op ${request.op}`)
    return { ok: true, value }
  })
}

/**
 * Deliberately without `setLabels`: a push never sends one any more (the
 * task's project is the board it lives in), and `stubBridge` throws on an op
 * it has no answer for — so a label message coming back would fail the test
 * that sent it rather than sail through.
 */
const HAPPY = {
  create: write({ id: 7 }),
  update: write(),
  moveToBucket: write({ bucketId: 3 }),
}

function sent(): VikunjaRequest[] {
  return bridge.mock.calls.map(([request]) => request)
}

function ops(): string[] {
  return sent().map((request) => request.op)
}

interface PushOptions {
  flat?: boolean
  /** The mapping **of the board** — `null` for a board that has none. */
  mapping?: StatusListMapping | null
  /** The whole board list, for the one case that is about not having one. */
  boards?: VikunjaBoard[]
}

/**
 * Pushes through the adapter, with the board carrying the mode and the
 * mapping.
 *
 * The context's `scope` and `mapping` are deliberately `null`: both are the
 * store's single-scope fields, and this adapter reads its own boards instead
 * (task 2) — passing them would hide the fact that it no longer needs them.
 */
function push(
  op: IntegrationPushOp,
  local: TodoTask,
  { flat = false, mapping, boards }: PushOptions = {},
): Promise<IntegrationOutcome<RemoteTaskRef>> {
  const board: VikunjaBoard = {
    ...BOARD,
    kanbanMapping: !flat,
    mapping: mapping === undefined ? (flat ? FLAT_MAPPING : MAPPING) : mapping,
  }
  // Through the interface, so the context the adapter no longer takes is
  // still handed over — exactly as the store hands it over.
  const adapter: TodoIntegration = new VikunjaIntegration({
    ...CONFIG,
    boards: boards ?? [board],
  })
  return adapter.pushTask(local, op, {
    scope: null,
    mapping: null,
    knownRef: local.remoteRef,
  })
}

beforeEach(() => {
  bridge.mockReset()
})

describe('pushTask: create', () => {
  it('creates the task with an HTML description, then places it', async () => {
    stubBridge(HAPPY)

    const out = await push({ kind: 'create' }, task({ remoteRef: null, description: 'a\nb' }))

    expect(out).toEqual({
      ok: true,
      // The ref comes from the *last* response — the move, which is the only
      // answer that knows the bucket.
      value: { taskId: 4, projectId: 1, identifier: '#3', bucketId: 3, updated: NEXT_ETAG },
    })
    expect(sent()[0]).toEqual({
      type: 'vikunja',
      op: 'create',
      cfg: CFG,
      projectId: 1,
      // Vikunja stores rich text: an escaped string would render as markup.
      payload: { title: 'Probe', description: '<p>a<br>b</p>' },
    })
  })

  it('moves the new task out of the default bucket into the mapped one', async () => {
    stubBridge(HAPPY)

    await push({ kind: 'create' }, task({ remoteRef: null, status: 'struggle' }))

    expect(ops()).toEqual(['create', 'moveToBucket'])
    expect(sent()[1]).toEqual({
      type: 'vikunja',
      op: 'moveToBucket',
      cfg: CFG,
      taskId: 7,
      projectId: 1,
      viewId: 4,
      bucketId: 5,
    })
  })

  it('spends no request on the project — it is the board it was created in', async () => {
    stubBridge(HAPPY)

    // `projectId` names the board (`String(board.projectId)`), which the
    // create above already decided. A label op would write one id space into
    // another.
    await push({ kind: 'create' }, task({ remoteRef: null, projectId: '1' }))

    expect(ops()).toEqual(['create', 'moveToBucket'])
  })

  it('re-creates a task whose ref belongs to another backend', async () => {
    stubBridge(HAPPY)

    // A hand-edited record can carry a Trello ref; it addresses no Vikunja
    // task, so an update would fail forever.
    const out = await push(
      { kind: 'update' },
      task({ remoteRef: { cardId: 'abc', shortLink: null, listId: 'l1', etag: null } }),
    )

    expect(out).toMatchObject({ ok: true })
    expect(ops()).toEqual(['create', 'moveToBucket'])
  })

  describe('flat mode', () => {
    it('sends nothing but the create for a task that is not done', async () => {
      stubBridge(HAPPY)

      const out = await push({ kind: 'create' }, task({ remoteRef: null }), { flat: true })

      expect(ops()).toEqual(['create'])
      expect(out).toEqual({
        ok: true,
        // Flat mode never learns a bucket, and does not pretend to.
        value: { taskId: 7, projectId: 1, identifier: '#3', bucketId: null, updated: NEXT_ETAG },
      })
    })

    it('marks a completed new task done instead of moving it', async () => {
      stubBridge(HAPPY)

      await push({ kind: 'create' }, task({ remoteRef: null, status: 'completed' }), { flat: true })

      expect(ops()).toEqual(['create', 'update'])
      expect(sent()[1]).toEqual({
        type: 'vikunja',
        op: 'update',
        cfg: CFG,
        taskId: 7,
        // The etag of the record we just created, not of the local ref.
        etag: NEXT_ETAG,
        payload: { done: true },
      })
    })
  })

  it('refuses an unmapped status before anything is created', async () => {
    // The destination is resolved first on purpose: discovering it afterwards
    // would leave a real task on the instance behind an outcome that says the
    // push never started.
    stubBridge(HAPPY)

    await expect(
      push({ kind: 'create' }, task({ remoteRef: null, status: 'struggle' }), {
        mapping: { ...MAPPING, struggle: [] },
      }),
    ).resolves.toEqual({ ok: false, errorKey: 'mappingIncomplete' })
    expect(bridge).not.toHaveBeenCalled()
  })

  it('reports the created ref when the move fails, so a retry cannot duplicate the task', async () => {
    bridge.mockImplementation(async (request) =>
      request.op === 'create'
        ? { ok: true, value: write({ id: 7 }) }
        : { ok: false, errorKey: 'rateLimited' },
    )

    const out = await push({ kind: 'create' }, task({ remoteRef: null }))

    expect(out).toEqual({
      ok: false,
      errorKey: 'rateLimited',
      // The task exists; the store has to remember that much even though the
      // push as a whole did not succeed.
      ref: { taskId: 7, projectId: 1, identifier: '#3', bucketId: null, updated: NEXT_ETAG },
    })
    expect(ops()).toEqual(['create', 'moveToBucket'])
  })

  it('reports the created ref when the flat-mode done toggle fails', async () => {
    bridge.mockImplementation(async (request) =>
      request.op === 'create'
        ? { ok: true, value: write({ id: 7 }) }
        : { ok: false, errorKey: 'network' },
    )

    const out = await push({ kind: 'create' }, task({ remoteRef: null, status: 'completed' }), {
      flat: true,
    })

    expect(out).toMatchObject({ ok: false, errorKey: 'network', ref: { taskId: 7 } })
    expect(ops()).toEqual(['create', 'update'])
  })

  it('reports no ref when the create itself failed — there is nothing to remember', async () => {
    bridge.mockResolvedValue({ ok: false, errorKey: 'authInvalid' })

    const out = await push({ kind: 'create' }, task({ remoteRef: null }))

    expect(out).toEqual({ ok: false, errorKey: 'authInvalid' })
    expect(ops()).toEqual(['create'])
  })
})

describe('pushTask: update', () => {
  it('sends the title and the description, and never `done`', async () => {
    stubBridge(HAPPY)

    const out = await push({ kind: 'update' }, task({ description: 'note' }))

    expect(out).toEqual({
      ok: true,
      // `bucketId: 0` in the answer keeps the last known bucket instead of
      // forgetting it.
      value: { taskId: 4, projectId: 1, identifier: '#3', bucketId: 1, updated: NEXT_ETAG },
    })
    expect(sent()).toEqual([
      {
        type: 'vikunja',
        op: 'update',
        cfg: CFG,
        taskId: 4,
        etag: ETAG,
        payload: { title: 'Probe', description: '<p>note</p>' },
      },
    ])
  })

  it.each([
    ['kanban', false],
    ['flat', true],
  ])('carries no done flag in %s mode either', async (_label, flat) => {
    stubBridge(HAPPY)

    await push({ kind: 'update' }, task({ status: 'completed' }), { flat })

    const request = sent()[0]
    expect(request.op).toBe('update')
    expect(request).not.toHaveProperty('payload.done')
  })

  it('blanks the description of a task that no longer has one', async () => {
    stubBridge(HAPPY)

    await push({ kind: 'update' }, task({ description: null }))

    expect(sent()[0]).toMatchObject({ payload: { description: '' } })
  })
})

describe('pushTask: status', () => {
  it('moves to the mapped bucket and sends exactly one message', async () => {
    stubBridge(HAPPY)

    const out = await push({ kind: 'status', previous: 'input' }, task({ status: 'inprogress' }))

    expect(out).toMatchObject({ ok: true, value: { bucketId: 3 } })
    expect(sent()).toEqual([
      {
        type: 'vikunja',
        op: 'moveToBucket',
        cfg: CFG,
        taskId: 4,
        projectId: 1,
        viewId: 4,
        bucketId: 2,
      },
    ])
  })

  it('completing a task is one move into the done bucket, with no done update', async () => {
    // Recon Q7: the done bucket sets `done` + `done_at` server-side. A second
    // request would be both redundant and a chance to disagree with it.
    stubBridge(HAPPY)

    await push({ kind: 'status', previous: 'input' }, task({ status: 'completed' }))

    expect(bridge).toHaveBeenCalledTimes(1)
    expect(sent()[0]).toMatchObject({ op: 'moveToBucket', bucketId: 3 })
  })

  it('un-completing is also one move, back to the mapped bucket', async () => {
    stubBridge(HAPPY)

    await push({ kind: 'status', previous: 'completed' }, task({ status: 'input' }))

    expect(bridge).toHaveBeenCalledTimes(1)
    expect(sent()[0]).toMatchObject({ op: 'moveToBucket', bucketId: 1 })
  })

  it('refuses a mapping row that names no bucket, without a request', async () => {
    stubBridge(HAPPY)

    await expect(
      push({ kind: 'status', previous: 'input' }, task({ status: 'struggle' }), {
        mapping: { ...MAPPING, struggle: [] },
      }),
    ).resolves.toEqual({ ok: false, errorKey: 'mappingIncomplete' })
    expect(bridge).not.toHaveBeenCalled()
  })

  describe('flat mode', () => {
    it('sets done when the task is completed', async () => {
      stubBridge(HAPPY)

      const out = await push({ kind: 'status', previous: 'input' }, task({ status: 'completed' }), {
        flat: true,
      })

      expect(out).toMatchObject({ ok: true, value: { updated: NEXT_ETAG } })
      expect(sent()).toEqual([
        {
          type: 'vikunja',
          op: 'update',
          cfg: CFG,
          taskId: 4,
          etag: ETAG,
          payload: { done: true },
        },
      ])
    })

    it('clears done when the task leaves completed', async () => {
      stubBridge(HAPPY)

      await push({ kind: 'status', previous: 'completed' }, task({ status: 'inprogress' }), {
        flat: true,
      })

      expect(sent()).toEqual([
        {
          type: 'vikunja',
          op: 'update',
          cfg: CFG,
          taskId: 4,
          etag: ETAG,
          payload: { done: false },
        },
      ])
    })

    it.each([
      ['input → inprogress', 'input', 'inprogress'],
      ['inprogress → struggle', 'inprogress', 'struggle'],
      ['struggle → deleted', 'struggle', 'deleted'],
    ] as const)('keeps %s local and sends nothing', async (_label, previous, status) => {
      stubBridge(HAPPY)

      const local = task({ status })
      const out = await push({ kind: 'status', previous }, local, { flat: true })

      expect(bridge).not.toHaveBeenCalled()
      // The ref is handed back untouched — there was nothing to learn.
      expect(out).toEqual({ ok: true, value: local.remoteRef })
    })
  })
})

describe('pushTask: labels', () => {
  it('never sends a label message, whatever the op', async () => {
    // The whole class of bug this replaces: `task.projectId` is a *board* id
    // now, and a label op would have written it into the instance's label
    // space — silently mislabelling someone's tasks.
    stubBridge(HAPPY)

    const ops: IntegrationPushOp[] = [
      { kind: 'create' },
      { kind: 'update' },
      { kind: 'status', previous: 'input' },
      { kind: 'delete' },
      { kind: 'resync' },
      { kind: 'project', previous: null },
    ]
    for (const op of ops) {
      await push(op, task({ status: 'inprogress', projectId: '1', remoteRef: ref() }))
    }

    expect(sent().map((request) => request.op)).not.toContain('setLabels')
  })
})

describe('pushTask: project', () => {
  it('is refused without a request — the project is the board', async () => {
    stubBridge(HAPPY)

    // Moving a Vikunja task between projects means creating a different task
    // elsewhere, so there is nothing this op could do to the record it was
    // handed. The store refuses the move first
    // (`projectPolicy.changeable: false`); this is what a hand-edited record
    // or a caller that forgot the policy gets.
    const out = await push({ kind: 'project', previous: '9' }, task({ projectId: '12' }))

    expect(out).toEqual({ ok: false, errorKey: 'pushFailed' })
    expect(bridge).not.toHaveBeenCalled()
  })
})

describe('pushTask: delete', () => {
  it('moves the task into the trash column in kanban mode', async () => {
    stubBridge(HAPPY)

    await push({ kind: 'delete' }, task({ status: 'deleted' }))

    expect(sent()).toEqual([
      {
        type: 'vikunja',
        op: 'moveToBucket',
        cfg: CFG,
        taskId: 4,
        projectId: 1,
        viewId: 4,
        bucketId: 6,
      },
    ])
  })

  it('never sends the destructive delete op', async () => {
    stubBridge(HAPPY)

    await push({ kind: 'delete' }, task({ status: 'deleted' }))
    await push({ kind: 'delete' }, task({ status: 'deleted' }), { flat: true })

    expect(ops()).not.toContain('delete')
  })

  it('is local-only in flat mode', async () => {
    stubBridge(HAPPY)

    const local = task({ status: 'deleted' })
    const out = await push({ kind: 'delete' }, local, { flat: true })

    expect(bridge).not.toHaveBeenCalled()
    expect(out).toEqual({ ok: true, value: local.remoteRef })
  })
})

describe('pushTask: failures', () => {
  it('passes a conflict through untouched, so the store can flag the task', async () => {
    bridge.mockResolvedValue({ ok: false, errorKey: 'conflict' })

    await expect(push({ kind: 'update' }, task())).resolves.toEqual({
      ok: false,
      errorKey: 'conflict',
    })
  })

  it.each(['authInvalid', 'permissionMissing', 'network', 'rateLimited', 'notFound'] as const)(
    'passes %s through untouched',
    async (errorKey) => {
      bridge.mockResolvedValue({ ok: false, errorKey })

      await expect(push({ kind: 'status', previous: 'input' }, task())).resolves.toEqual({
        ok: false,
        errorKey,
      })
    },
  )

  it('refuses a payload that does not match the write schema', async () => {
    // The bridge validates the envelope only, so a worker answering with the
    // wrong shape must never become a persisted ref.
    bridge.mockResolvedValue({ ok: true, value: { id: 4 } })

    await expect(push({ kind: 'update' }, task())).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
  })

  it('answers mappingIncomplete for a connection with no board, without a request', async () => {
    // Nothing to write to: the adapter takes the board — the mode, the
    // columns, the project it writes into — out of its own config, so a
    // connection that has picked none addresses nothing.
    stubBridge(HAPPY)

    await expect(push({ kind: 'update' }, task(), { boards: [] })).resolves.toEqual({
      ok: false,
      errorKey: 'mappingIncomplete',
    })
    expect(bridge).not.toHaveBeenCalled()
  })

  it('answers mappingIncomplete for a kanban board whose wizard never finished', async () => {
    // No mapping on the board names no bucket for any status — the same
    // refusal as an empty row, from the other direction.
    stubBridge(HAPPY)

    await expect(
      push({ kind: 'status', previous: 'input' }, task({ status: 'struggle' }), { mapping: null }),
    ).resolves.toEqual({ ok: false, errorKey: 'mappingIncomplete' })
    expect(bridge).not.toHaveBeenCalled()
  })
})

describe('pushTask: resync', () => {
  it('moves the task to where its status belongs, and nothing else', async () => {
    stubBridge(HAPPY)

    const out = await push({ kind: 'resync' }, task({ status: 'inprogress', projectId: '1' }))

    expect(out).toMatchObject({ ok: true, value: { bucketId: 3 } })
    // One message: the bucket is the only thing the widget owns that can
    // have drifted. The project is the board the task lives on.
    expect(sent()).toEqual([
      {
        type: 'vikunja',
        op: 'moveToBucket',
        cfg: CFG,
        taskId: 4,
        projectId: 1,
        viewId: 4,
        bucketId: 2,
      },
    ])
  })

  it('never sends the title or the description', async () => {
    // A retry must not push the widget's flattened copy over a description
    // the user has since edited in Vikunja's own editor.
    stubBridge(HAPPY)

    await push({ kind: 'resync' }, task({ description: 'local copy', projectId: '9' }))

    for (const request of sent()) {
      expect(JSON.stringify(request)).not.toContain('local copy')
      expect(request.op).not.toBe('update')
    }
  })

  it('skips the move when the ref already sits in the right bucket', async () => {
    stubBridge(HAPPY)

    const out = await push({ kind: 'resync' }, task({ status: 'input', remoteRef: ref() }))

    // `ref().bucketId` is 1, which is exactly where `input` maps.
    expect(bridge).not.toHaveBeenCalled()
    expect(out).toEqual({ ok: true, value: ref() })
  })

  it.each([
    ['a ref that never learned its bucket', null],
    ['the zero sentinel', 0],
  ])('moves anyway given %s', async (_label, bucketId) => {
    stubBridge(HAPPY)

    await push({ kind: 'resync' }, task({ status: 'input', remoteRef: ref({ bucketId }) }))

    expect(ops()).toEqual(['moveToBucket'])
  })

  it('reports the move failure with the ref it started from', async () => {
    bridge.mockResolvedValue({ ok: false, errorKey: 'rateLimited' })

    const local = task({ status: 'inprogress' })
    const out = await push({ kind: 'resync' }, local)

    expect(out).toEqual({ ok: false, errorKey: 'rateLimited' })
    expect(ops()).toEqual(['moveToBucket'])
  })

  it('sends nothing for a task already in place', async () => {
    stubBridge(HAPPY)

    await push({ kind: 'resync' }, task({ status: 'input' }))

    expect(bridge).not.toHaveBeenCalled()
  })

  describe('flat mode', () => {
    it.each([
      ['completed', 'completed', true],
      ['input', 'input', false],
    ] as const)('asserts done=%s for a %s task', async (_label, status, done) => {
      stubBridge(HAPPY)

      await push({ kind: 'resync' }, task({ status }), { flat: true })

      expect(sent()).toEqual([
        {
          type: 'vikunja',
          op: 'update',
          cfg: CFG,
          taskId: 4,
          etag: ETAG,
          payload: { done },
        },
      ])
    })

    it('touches no bucket and no label', async () => {
      stubBridge(HAPPY)

      await push({ kind: 'resync' }, task({ projectId: '9' }), { flat: true })

      expect(ops()).toEqual(['update'])
    })
  })
})

describe('pushTask: field clamps', () => {
  /** The very schemas the worker validates an incoming payload against. */
  function assertWorkerAccepts(request: VikunjaRequest) {
    if (request.op === 'create') {
      expect(vikunjaCreatePayloadSchema.safeParse(request.payload).success).toBe(true)
      return
    }
    if (request.op === 'update') {
      expect(vikunjaUpdatePayloadSchema.safeParse(request.payload).success).toBe(true)
      return
    }
    throw new Error(`not a payload-carrying op: ${request.op}`)
  }

  it('shortens a title no user typed on purpose', async () => {
    stubBridge(HAPPY)

    await push({ kind: 'create' }, task({ remoteRef: null, title: 'x'.repeat(5000) }))

    const request = sent()[0]
    expect(request).toMatchObject({ op: 'create' })
    if (request.op !== 'create') return
    expect(request.payload.title).toHaveLength(VIKUNJA_MAX_TITLE_LENGTH)
    assertWorkerAccepts(request)
  })

  it('measures the description as the HTML it becomes, not as the text', async () => {
    // 6 000 ampersands escape to 30 000 characters — nearly twice the ceiling —
    // so a clamp that counted the plain text would hand the worker a payload
    // it must refuse.
    stubBridge(HAPPY)

    await push({ kind: 'create' }, task({ remoteRef: null, description: '&'.repeat(6000) }))

    const request = sent()[0]
    expect(request).toMatchObject({ op: 'create' })
    if (request.op !== 'create') return
    const description = request.payload.description ?? ''
    expect(description.length).toBeLessThanOrEqual(VIKUNJA_MAX_DESCRIPTION_LENGTH)
    // Cut at a character boundary, never inside an escape sequence.
    expect(description.endsWith('&amp;</p>')).toBe(true)
    assertWorkerAccepts(request)
  })

  it('clamps an edit the same way', async () => {
    stubBridge(HAPPY)

    await push({ kind: 'update' }, task({ title: 'y'.repeat(5000), description: '&'.repeat(6000) }))

    const request = sent()[0]
    expect(request).toMatchObject({ op: 'update' })
    if (request.op !== 'update') return
    expect(request.payload.title).toHaveLength(VIKUNJA_MAX_TITLE_LENGTH)
    expect((request.payload.description ?? '').length).toBeLessThanOrEqual(
      VIKUNJA_MAX_DESCRIPTION_LENGTH,
    )
    assertWorkerAccepts(request)
  })
})
