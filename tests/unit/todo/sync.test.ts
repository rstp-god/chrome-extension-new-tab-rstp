import { describe, expect, it, vi } from 'vitest'

import {
  inferOpForTask,
  pushPhase,
  reconcile,
  selectPendingTasks,
  unlinkedLocalTasks,
} from '@/widgets/Todo/store/sync.ts'

import type {
  IntegrationDescriptor,
  IntegrationOutcome,
  RemoteTaskRef,
  StatusListMapping,
  TodoIntegration,
  TrelloRemoteRef,
} from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'

const MAPPING: StatusListMapping = {
  input: ['l-input'],
  inprogress: ['l-doing'],
  struggle: ['l-stuck'],
  completed: ['l-done'],
  deleted: ['l-trash'],
}

function task(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: 'a',
    title: 'Task',
    description: null,
    status: 'input',
    projectId: null,
    createdAt: 1,
    statusChangedAt: 1,
    completedAt: null,
    deletedAt: null,
    linkedTab: null,
    remoteRef: null,
    syncState: 'clean',
    ...overrides,
  }
}

function trelloRef(overrides: Partial<TrelloRemoteRef> = {}): TrelloRemoteRef {
  return { cardId: 'c-1', shortLink: null, listId: 'l-input', etag: null, ...overrides }
}

/** Owns Trello refs only — the same rule the real descriptors use. */
const descriptor = {
  pushConcurrency: undefined,
  ownsRef: (ref: RemoteTaskRef) => 'cardId' in ref,
} as unknown as IntegrationDescriptor

function withConcurrency(limit: number | undefined): IntegrationDescriptor {
  return { ...descriptor, pushConcurrency: limit } as IntegrationDescriptor
}

function withAutoImport(autoImportLocalTasks: boolean | undefined): IntegrationDescriptor {
  return { ...descriptor, autoImportLocalTasks } as IntegrationDescriptor
}

function adapterPushing(
  pushTask: (task: TodoTask) => Promise<IntegrationOutcome<RemoteTaskRef>>,
): TodoIntegration {
  return { pushTask: vi.fn((t: TodoTask) => pushTask(t)) } as unknown as TodoIntegration
}

const ok: IntegrationOutcome<RemoteTaskRef> = { ok: true, value: trelloRef() }

function phase(
  tasks: TodoTask[],
  pushTask: (task: TodoTask) => Promise<IntegrationOutcome<RemoteTaskRef>>,
  limit?: number,
) {
  const outcomes: [string, IntegrationOutcome<RemoteTaskRef>][] = []
  const done = pushPhase(tasks, {
    adapter: adapterPushing(pushTask),
    descriptor: withConcurrency(limit),
    scope: { boardId: 'b' },
    mapping: MAPPING,
    onOutcome: (t, out) => outcomes.push([t.id, out]),
  })
  return { done, outcomes }
}

describe('inferOpForTask', () => {
  it('creates a task that has never reached the remote', () => {
    expect(inferOpForTask(task({ remoteRef: null }))).toEqual({ kind: 'create' })
  })

  it('resyncs a task that has a ref — never updates it', () => {
    // The widget cannot edit a title or a description, so an `update` retry
    // could only push a stale copy over the backend's own.
    expect(inferOpForTask(task({ remoteRef: trelloRef() }))).toEqual({ kind: 'resync' })
  })
})

describe('pushPhase', () => {
  it('reports every outcome and answers null when all of them landed', async () => {
    const { done, outcomes } = phase([task({ id: 'a' }), task({ id: 'b' })], async () => ok)

    await expect(done).resolves.toBeNull()
    expect(outcomes.map(([id]) => id)).toEqual(['a', 'b'])
  })

  it('answers the first hard error and starts nothing after it', async () => {
    const seen: string[] = []
    const { done, outcomes } = phase(
      [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })],
      async (t) => {
        seen.push(t.id)
        return t.id === 'a' ? { ok: false, errorKey: 'rateLimited' } : ok
      },
    )

    await expect(done).resolves.toBe('rateLimited')
    expect(seen).toEqual(['a'])
    // The failure is still reported — the store marks that task, then stops.
    expect(outcomes).toHaveLength(1)
  })

  it('carries on past a conflict, which is one task losing a race', async () => {
    const { done, outcomes } = phase([task({ id: 'a' }), task({ id: 'b' })], async (t) =>
      t.id === 'a' ? { ok: false, errorKey: 'conflict' } : ok,
    )

    await expect(done).resolves.toBeNull()
    expect(outcomes).toHaveLength(2)
    expect(outcomes[0][1]).toEqual({ ok: false, errorKey: 'conflict' })
  })

  it('pushes one at a time unless the descriptor says otherwise', async () => {
    let live = 0
    let peak = 0
    const busy = async () => {
      live += 1
      peak = Math.max(peak, live)
      await new Promise((resolve) => setTimeout(resolve, 0))
      live -= 1
      return ok
    }

    await phase([task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })], busy).done
    expect(peak).toBe(1)

    peak = 0
    await phase([task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })], busy, 3).done
    expect(peak).toBeGreaterThan(1)
  })
})

describe('reconcile', () => {
  it('takes a pulled task nobody knows locally', () => {
    const pulled = task({ id: 'new', remoteRef: trelloRef() })

    expect(reconcile([pulled], [], [], descriptor)).toEqual({
      tasks: [pulled],
      conflictTaskIds: [],
    })
  })

  it('keeps linkedTab and a non-clean syncState on a known task', () => {
    const local = task({
      id: 'a',
      syncState: 'dirty',
      linkedTab: { url: 'https://local.example', title: 'Local' },
      remoteRef: trelloRef(),
    })
    const pulled = task({ id: 'a', title: 'remote title', remoteRef: trelloRef() })

    const out = reconcile([pulled], [local], [], descriptor)

    expect(out.tasks[0]).toMatchObject({
      title: 'remote title',
      syncState: 'dirty',
      linkedTab: local.linkedTab,
    })
  })

  it('lets the remote win for a conflicted task and drops the flag', () => {
    const local = task({
      id: 'a',
      title: 'my rolled-back edit',
      syncState: 'error',
      linkedTab: { url: 'https://local.example', title: 'Local' },
      remoteRef: trelloRef(),
    })
    const pulled = task({ id: 'a', title: 'what the remote says', remoteRef: trelloRef() })

    const out = reconcile([pulled], [local], ['a'], descriptor)

    expect(out.tasks[0]).toMatchObject({
      title: 'what the remote says',
      // Not 'error': the conflict is settled, and on the remote's terms.
      syncState: 'clean',
      linkedTab: local.linkedTab,
    })
    expect(out.conflictTaskIds).toEqual([])
  })

  it('keeps a local task the pull could not have mentioned', () => {
    const inFlight = task({ id: 'no-ref', remoteRef: null })
    const foreign = task({ id: 'foreign', remoteRef: { taskId: 7 } as RemoteTaskRef })

    const out = reconcile([], [inFlight, foreign], [], descriptor)

    expect(out.tasks.map((t) => t.id)).toEqual(['no-ref', 'foreign'])
  })

  it('drops a task whose owned ref the pull left out — it was deleted remotely', () => {
    const out = reconcile([], [task({ id: 'gone', remoteRef: trelloRef() })], [], descriptor)

    expect(out.tasks).toEqual([])
  })

  it('keeps a flag on a surviving task and drops the rest', () => {
    const survivor = task({ id: 'foreign', remoteRef: { taskId: 7 } as RemoteTaskRef })
    const deleted = task({ id: 'gone', remoteRef: trelloRef() })

    const out = reconcile([], [survivor, deleted], ['foreign', 'gone', 'never-existed'], descriptor)

    // An id with no task badges nothing and would keep the list growing.
    expect(out.conflictTaskIds).toEqual(['foreign'])
  })

  it('does not mutate the lists it was handed', () => {
    const local = [task({ id: 'a', remoteRef: trelloRef() })]
    const pulled = [task({ id: 'a', remoteRef: trelloRef() })]
    const unresolved = ['a']

    reconcile(pulled, local, unresolved, descriptor)

    expect(local).toHaveLength(1)
    expect(pulled).toHaveLength(1)
    expect(unresolved).toEqual(['a'])
  })
})

describe('selectPendingTasks', () => {
  const tasks = [
    task({ id: 'clean-linked', syncState: 'clean', remoteRef: trelloRef() }),
    task({ id: 'dirty-linked', syncState: 'dirty', remoteRef: trelloRef({ cardId: 'c-2' }) }),
    task({ id: 'error-linked', syncState: 'error', remoteRef: trelloRef({ cardId: 'c-3' }) }),
    task({ id: 'dirty-local', syncState: 'dirty', remoteRef: null }),
    task({ id: 'clean-local', syncState: 'clean', remoteRef: null }),
  ]

  function ids(descriptor: IntegrationDescriptor) {
    return selectPendingTasks(tasks, descriptor)
      .map((t) => t.id)
      .sort()
  }

  it('sweeps tasks that predate the integration along when the backend takes them', () => {
    expect(ids(withAutoImport(true))).toEqual([
      'clean-local',
      'dirty-linked',
      'dirty-local',
      'error-linked',
    ])
  })

  it('leaves them alone for a backend that wants an explicit import', () => {
    // `clean-local` is the one difference: it has never been pushed and the
    // user has not asked for it to be.
    expect(ids(withAutoImport(false))).toEqual(['dirty-linked', 'dirty-local', 'error-linked'])
  })

  it('treats a descriptor that says nothing as "do not import"', () => {
    expect(ids(withAutoImport(undefined))).toEqual(ids(withAutoImport(false)))
  })

  it('never pushes a clean, already-linked task', () => {
    for (const flag of [true, false, undefined]) {
      expect(ids(withAutoImport(flag))).not.toContain('clean-linked')
    }
  })
})

describe('unlinkedLocalTasks', () => {
  it('answers the tasks that were never pushed and are not waiting to be', () => {
    const found = unlinkedLocalTasks([
      task({ id: 'a', syncState: 'clean', remoteRef: null }),
      // Created while the integration was active: already on its way.
      task({ id: 'b', syncState: 'dirty', remoteRef: null }),
      task({ id: 'c', syncState: 'clean', remoteRef: trelloRef() }),
    ])

    expect(found.map((t) => t.id)).toEqual(['a'])
  })

  it('leaves the widget\u2019s own trash out of the offer', () => {
    // "Import my local tasks" cannot mean "re-create what I threw away in
    // someone else's tracker".
    const found = unlinkedLocalTasks([
      task({ id: 'kept', syncState: 'clean', remoteRef: null }),
      task({ id: 'trashed', syncState: 'clean', remoteRef: null, status: 'deleted' }),
    ])

    expect(found.map((t) => t.id)).toEqual(['kept'])
  })
})
