/**
 * The two halves of `syncNow` that are worth reasoning about on their own:
 * which tasks get pushed and what happens to each outcome, and how a pull is
 * merged back into the local list.
 *
 * They live outside the store because inside it they were only reachable
 * through a Zustand action that also touches `loading`, `errorKey`,
 * `chrome.storage` and an adapter — so every rule in them had to be tested
 * through a full fake integration. Here `reconcile` is a pure function and
 * `pushPhase` takes its one side effect as a callback.
 */

import { mapWithConcurrency } from '@/widgets/Todo/utils/concurrency.ts'

import type {
  IntegrationDescriptor,
  IntegrationErrorKey,
  IntegrationOutcome,
  IntegrationPushOp,
  RemoteScope,
  RemoteTaskRef,
  StatusListMapping,
  TodoIntegration,
} from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask } from '@/widgets/Todo/store/schema.ts'

/**
 * Which push a task needs when the store no longer knows what changed.
 *
 * A task with no ref has never reached the remote, so it is a `create`.
 * Everything else is a `resync`, deliberately **not** an `update`: the widget
 * has no title/description editing UI, so its copy of those two fields is
 * whatever the last pull gave it (flattened to plain text for Vikunja). An
 * `update` retry would push that back over whatever the user has since written
 * in the backend's own editor. `resync` re-asserts only what the widget owns —
 * the container the status maps to, and the project.
 */
export function inferOpForTask(task: TodoTask): IntegrationPushOp {
  if (!task.remoteRef) return { kind: 'create' }
  return { kind: 'resync' }
}

/**
 * Which tasks phase 1 pushes.
 *
 * - anything not `clean` is a normal dirty/error retry;
 * - a `clean` task with a ref is already where it belongs;
 * - a `clean` task with **no** ref has never reached the backend, and whether
 *   a sync may send it is the descriptor's call. Trello says yes (that has
 *   always been its behaviour); Vikunja — and anything that does not declare
 *   the flag — says no, and such a task waits for the explicit import instead
 *   (ADR §Р10). `reconcile`'s rule 4 is what keeps it in the list meanwhile.
 */
export function selectPendingTasks(
  tasks: readonly TodoTask[],
  descriptor: IntegrationDescriptor,
): TodoTask[] {
  const autoImport = descriptor.autoImportLocalTasks === true
  return tasks.filter((task) => {
    if (task.syncState !== 'clean') return true
    if (task.remoteRef !== null) return false
    return autoImport
  })
}

/**
 * Tasks that predate the integration: never pushed, and not waiting to be.
 *
 * The other half of the rule above — what the settings summary offers to
 * import, and counts.
 *
 * Two exclusions, both about not surprising the user with what an import
 * creates. A `dirty` unlinked task was created while the integration was
 * active, so it is already on its way. A `deleted` one is in the widget's own
 * trash: "import my local tasks" cannot sensibly mean "re-create the things I
 * threw away in someone's tracker", and the count in the button has to match
 * what the preview lists. `importLocalTasks` stays permissive on purpose —
 * ids come from that preview, and the store does not second-guess an explicit
 * list.
 */
export function unlinkedLocalTasks(tasks: readonly TodoTask[]): TodoTask[] {
  return tasks.filter(
    (task) => task.remoteRef === null && task.syncState === 'clean' && task.status !== 'deleted',
  )
}

export interface PushPhaseDeps {
  adapter: TodoIntegration
  descriptor: IntegrationDescriptor
  scope: RemoteScope
  mapping: StatusListMapping
  /**
   * Applies one settled push to the store. Called for every outcome,
   * successes and failures alike — including conflicts, which are a per-task
   * state rather than a reason to stop.
   */
  onOutcome: (task: TodoTask, out: IntegrationOutcome<RemoteTaskRef>) => void
}

/**
 * Pushes every task in `tasks` and answers the first **hard** error, or `null`
 * when the phase got through.
 *
 * "Hard" excludes a conflict: that one task lost a race, the others are fine,
 * and the pull that follows is exactly what resolves it. Any other failure
 * ends the phase — `mapWithConcurrency` cannot recall the calls already in
 * flight, so "ends" means nothing new is started.
 *
 * Concurrency comes from the descriptor and defaults to 1, which is a plain
 * sequential loop: a backend only gets parallel writes when it has said that
 * two of them cannot interleave into one record.
 */
export async function pushPhase(
  tasks: readonly TodoTask[],
  deps: PushPhaseDeps,
): Promise<IntegrationErrorKey | null> {
  let failure: IntegrationErrorKey | null = null

  await mapWithConcurrency(tasks, deps.descriptor.pushConcurrency ?? 1, async (task) => {
    if (failure !== null) return

    const out = await deps.adapter.pushTask(task, inferOpForTask(task), {
      scope: deps.scope,
      mapping: deps.mapping,
      knownRef: task.remoteRef,
    })

    deps.onOutcome(task, out)
    if (!out.ok && out.errorKey !== 'conflict') failure ??= out.errorKey
  })

  return failure
}

export interface ReconcileResult {
  tasks: TodoTask[]
  conflictTaskIds: string[]
}

/**
 * Merges a pull into the local list.
 *
 * The rules, in the order they apply to one task:
 *
 * 1. a pulled task nobody knows locally is taken as it is;
 * 2. a pulled task that is **in conflict** is replaced by the remote version
 *    wholesale — that is what a conflict means — so its `syncState` becomes
 *    clean again and the flag is dropped. Only `linkedTab` survives, because
 *    Vikunja has no field for it and the conflict was never about it;
 * 3. any other pulled task keeps its local-only fields: `linkedTab`, and a
 *    non-clean `syncState` (an edit that landed while the pull was in flight
 *    must stay dirty, or it would never be pushed);
 * 4. a local task the pull did not mention is kept only when the pull *could
 *    not* have mentioned it: no ref at all (it may be mid-create), or a ref
 *    this descriptor does not own. One with an owned ref was deleted remotely
 *    and drops out.
 *
 * `conflictTaskIds` comes back as the flags that are still both unresolved and
 * attached to a task that exists — an id with no task would badge nothing and
 * keep the list growing.
 */
export function reconcile(
  pulled: readonly TodoTask[],
  local: readonly TodoTask[],
  unresolved: readonly string[],
  descriptor: IntegrationDescriptor,
): ReconcileResult {
  const localById = new Map(local.map((task) => [task.id, task]))
  const conflicted = new Set(unresolved)

  const tasks: TodoTask[] = pulled.map((remote) => {
    const known = localById.get(remote.id)
    if (!known) return remote

    if (conflicted.has(remote.id)) {
      conflicted.delete(remote.id)
      return { ...remote, linkedTab: known.linkedTab }
    }

    return {
      ...remote,
      linkedTab: known.linkedTab,
      syncState: known.syncState === 'clean' ? 'clean' : known.syncState,
    }
  })

  const pulledIds = new Set(pulled.map((task) => task.id))
  for (const task of local) {
    if (pulledIds.has(task.id)) continue
    if (!task.remoteRef || !descriptor.ownsRef(task.remoteRef)) tasks.push(task)
  }

  const surviving = new Set(tasks.map((task) => task.id))
  return {
    tasks,
    conflictTaskIds: [...conflicted].filter((id) => surviving.has(id)),
  }
}
