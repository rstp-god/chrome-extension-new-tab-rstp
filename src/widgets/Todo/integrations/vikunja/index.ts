import { VIKUNJA_MUTATION_CONCURRENCY } from '@/background/vikunja/messages.ts'
import { isVikunjaRef } from '@/widgets/Todo/integrations/types.ts'
import { urlHost } from '@/widgets/Todo/utils/url.ts'

import { boardForProject, defaultBoard } from './boards.ts'
import { sendVikunjaMessage } from './bridge.ts'
import { isReservedLabel, labelToProject, vikunjaTaskToTodo } from './mapping.ts'
import { recoverVikunjaPermission } from './permission.ts'
import { pushVikunjaTask } from './push.ts'
import { scopePair } from './scope.ts'
import {
  vikunjaBucketSummaryListSchema,
  vikunjaBucketSummarySchema,
  vikunjaConnectInfoSchema,
  vikunjaLabelSummaryListSchema,
  vikunjaProjectSummaryListSchema,
  vikunjaPullResultSchema,
} from './schema.ts'
import { subscribeVikunjaRemoteChanges } from './subscribe.ts'
import { VikunjaConnectForm } from './VikunjaConnectForm.tsx'
import { VikunjaMappingStep } from './VikunjaMappingStep.tsx'
import { VikunjaSummaryExtras } from './VikunjaSummaryExtras.tsx'

import type {
  VikunjaBucketSummary,
  VikunjaRequest,
  VikunjaWire,
} from '@/background/vikunja/messages.ts'
import type {
  IntegrationDescriptor,
  IntegrationOutcome,
  IntegrationPushOp,
  Project,
  PullContext,
  PullResult,
  PushContext,
  RemoteContainer,
  RemoteScope,
  RemoteScopeOption,
  RemoteTaskRef,
  TodoIntegration,
} from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask, VikunjaBoard, VikunjaConfig } from '@/widgets/Todo/store/store.ts'
import type { z } from 'zod'

/** A scope that does not address a project *and* a view addresses nothing. */
const NO_SCOPE: IntegrationOutcome<never> = { ok: false, errorKey: 'notFound' }

/**
 * Vikunja adapter.
 *
 * Unlike Trello's, it owns no HTTP client: Vikunja sends no CORS headers to a
 * `chrome-extension://` origin, so every request runs in the service worker
 * and this class only speaks to the bridge. The config travels with each
 * message because the worker keeps no state between wake-ups.
 */
export class VikunjaIntegration implements TodoIntegration {
  constructor(private readonly config: VikunjaConfig) {}

  async connect(): Promise<IntegrationOutcome<{ userHandle: string }>> {
    const out = await this.send(
      { type: 'vikunja', op: 'connect', cfg: this.wire() },
      vikunjaConnectInfoSchema,
    )
    if (!out.ok) return out
    return { ok: true, value: { userHandle: out.value.userHandle } }
  }

  /** Nothing to release: no client, no socket, no timer. */
  disconnect(): void {}

  /**
   * Every project that can actually be mapped: archived ones and ones with no
   * kanban view are dropped here rather than in the worker, because "can this
   * be mapped to buckets" is the widget's question, not the transport's.
   */
  async listScopes(): Promise<IntegrationOutcome<RemoteScopeOption[]>> {
    const out = await this.send(
      { type: 'vikunja', op: 'listProjects', cfg: this.wire() },
      vikunjaProjectSummaryListSchema,
    )
    if (!out.ok) return out

    return {
      ok: true,
      value: out.value
        .filter((project) => !project.isArchived && project.kanbanViewId !== null)
        .map((project) => ({
          scope: { projectId: project.id, viewId: project.kanbanViewId as number },
          name: project.title,
        })),
    }
  }

  async listContainers(scope: RemoteScope): Promise<IntegrationOutcome<RemoteContainer[]>> {
    const pair = scopePair(scope)
    if (!pair) return NO_SCOPE

    const out = await this.send(
      { type: 'vikunja', op: 'listBuckets', cfg: this.wire(), ...pair },
      vikunjaBucketSummaryListSchema,
    )
    if (!out.ok) return out

    return { ok: true, value: out.value.map(toContainer) }
  }

  /**
   * Labels are instance-wide in Vikunja, so the scope plays no part — the
   * parameter the contract declares is deliberately not taken.
   */
  async listProjects(): Promise<IntegrationOutcome<Project[]>> {
    const out = await this.listLabels()
    if (!out.ok) return out
    return { ok: true, value: out.value.map(labelToProject) }
  }

  /**
   * One full read of the view: every bucket, every task, done included.
   *
   * The labels are fetched alongside it on a **forced** pull, because a task
   * carries only label *ids* and the adapter has to know which of them are
   * real projects rather than the reserved `energy:` / `mood:` ones. A
   * failure there is propagated instead of defaulting to "everything
   * counts": defaulting would stamp a reserved label onto tasks as their
   * project, which is precisely what the reserved list exists to prevent. A
   * non-forced pull spends no request on them at all — see the body.
   */
  async pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>> {
    const pair = scopePair(ctx.scope)
    if (!pair) return NO_SCOPE

    /**
     * Labels are read only when the pull is a real read of the instance.
     *
     * They are needed to tell a task's project from a reserved label, and
     * they are instance-wide — so re-listing them on every sync meant a
     * second request to someone's own server for an answer that had not
     * changed, on every background broadcast. A non-forced pull therefore
     * uses the ids the store already has (`knownProjectIds`); a forced one —
     * the user's own sync, a freshly mounted widget — refreshes them, which
     * is also what puts a newly created label on a card.
     */
    const cachedProjectIds = ctx.knownProjectIds
    const labels =
      ctx.force === true || cachedProjectIds === undefined ? await this.listLabels() : null
    if (labels && !labels.ok) return labels

    // `force` decides whether the worker reads the instance or answers from
    // the snapshot it broadcast a moment ago — see `PullContext.force`.
    const pull = await this.send(
      { type: 'vikunja', op: 'pull', cfg: this.wire(), ...pair, force: ctx.force === true },
      vikunjaPullResultSchema,
    )
    if (!pull.ok) return pull

    // One pass over the known refs instead of a scan per pulled task: a
    // board with a few hundred tasks would otherwise be quadratic.
    const localIdByTaskId = new Map<number, string>()
    for (const [localId, ref] of Object.entries(ctx.knownRefs)) {
      if (isVikunjaRef(ref)) localIdByTaskId.set(ref.taskId, localId)
    }

    const projectIds = new Set(
      labels ? labels.value.map((label) => String(label.id)) : (cachedProjectIds ?? []),
    )
    const taskContext = {
      mapping: ctx.mapping,
      localIdByTaskId,
      knownStatuses: ctx.knownStatuses,
      // `kanbanMapping: false` means the user skipped the bucket wizard for
      // this board and only `completed` round-trips.
      flat: !this.board(pair.projectId)?.kanbanMapping,
      projectIds,
      // Every ref built below says which board its task lives on.
      boardProjectId: pair.projectId,
    }

    const tasks: TodoTask[] = []
    const refs: Record<string, RemoteTaskRef> = {}
    for (const remote of pull.value.tasks) {
      const task = vikunjaTaskToTodo(remote, taskContext)
      tasks.push(task)
      if (task.remoteRef) refs[task.id] = task.remoteRef
    }

    return { ok: true, value: { tasks, refs } }
  }

  /** Creates one kanban column, for the mapping wizard. */
  async createContainer(
    scope: RemoteScope,
    title: string,
  ): Promise<IntegrationOutcome<RemoteContainer>> {
    const pair = scopePair(scope)
    if (!pair) return NO_SCOPE

    const out = await this.send(
      { type: 'vikunja', op: 'createBucket', cfg: this.wire(), ...pair, title },
      vikunjaBucketSummarySchema,
    )
    if (!out.ok) return out

    return { ok: true, value: toContainer(out.value) }
  }

  /**
   * One local mutation, as one to three bridge ops.
   *
   * The rules live in `push.ts`; all this does is resolve the scope and hand
   * over the three things the push cannot work out for itself — the
   * credentials, the mode, and a `send` that validates what comes back.
   */
  async pushTask(
    task: TodoTask,
    op: IntegrationPushOp,
    ctx: PushContext,
  ): Promise<IntegrationOutcome<RemoteTaskRef>> {
    const scope = scopePair(ctx.scope)
    if (!scope) return NO_SCOPE

    return pushVikunjaTask(
      {
        cfg: this.wire(),
        // `kanbanMapping: false` means the user skipped the bucket wizard for
        // this board and only `completed` round-trips.
        flat: !this.board(scope.projectId)?.kanbanMapping,
        send: (request, schema) => this.send(request, schema),
      },
      { task, op, ctx, scope },
    )
  }

  // ---------- internals ----------

  /**
   * The board an op is about — the one the scope addresses, falling back to
   * the default one (see `boardForProject`). It carries the mode and the
   * cached columns; the credentials are per connection and come from `wire`.
   */
  private board(projectId: number): VikunjaBoard | null {
    return boardForProject(this.config, projectId)
  }

  /** Credentials as the bridge wants them — never the whole config. */
  private wire(): VikunjaWire {
    return { baseUrl: this.config.baseUrl, token: this.config.token }
  }

  /**
   * Sends one op and validates its payload.
   *
   * The bridge checks the envelope only (`value` is `unknown` by design), so
   * every op parses its own answer here — a worker answering with the wrong
   * shape must never surface as a successful read.
   */
  private async send<S extends z.ZodType>(
    request: VikunjaRequest,
    schema: S,
  ): Promise<IntegrationOutcome<z.infer<S>>> {
    const response = await sendVikunjaMessage<unknown>(request)
    if (!response.ok) return { ok: false, errorKey: response.errorKey }

    const parsed = schema.safeParse(response.value)
    if (!parsed.success) return { ok: false, errorKey: 'unknown' }
    return { ok: true, value: parsed.data }
  }

  /** Non-reserved labels only — the reserved ones belong to another feature. */
  private async listLabels() {
    const out = await this.send(
      { type: 'vikunja', op: 'listLabels', cfg: this.wire() },
      vikunjaLabelSummaryListSchema,
    )
    if (!out.ok) return out
    return { ok: true as const, value: out.value.filter((label) => !isReservedLabel(label.title)) }
  }
}

/**
 * The flags are set only when true, never as `false`: the persisted container
 * schema makes them optional so records written by the Trello-only build stay
 * byte-identical, and writing an explicit `false` would start changing them
 * for no reason.
 */
function toContainer(bucket: VikunjaBucketSummary): RemoteContainer {
  return {
    id: String(bucket.id),
    name: bucket.title,
    ...(bucket.isDone ? { isTerminal: true } : {}),
    ...(bucket.isDefault ? { isDefault: true } : {}),
  }
}

export const descriptor: IntegrationDescriptor = {
  name: 'vikunja',
  titleI18nKey: 'todoWidget:integrations.vikunja.title',
  descriptionI18nKey: 'todoWidget:integrations.vikunja.description',
  ConnectForm: VikunjaConnectForm,
  /**
   * The generic mapping table cannot express Vikunja's rules: the done
   * bucket owns `completed`, and a board without a struggle/trash column
   * needs either new columns or flat mode.
   */
  MappingStep: VikunjaMappingStep,
  /** The background-pull period, and the flat-mode caveat. */
  SummaryExtras: VikunjaSummaryExtras,
  /**
   * The instance is the one thing about this backend the user typed, so the
   * permission banner can name it. `host` rather than the whole base URL: a
   * match pattern is per host, which is exactly what was withdrawn.
   */
  describeHost: (config) => urlHost((config as VikunjaConfig)?.baseUrl ?? '', null),
  /**
   * Flat mode's mapping is a placeholder pointing four statuses at the
   * default bucket; see `showsStatusMapping`.
   */
  showsStatusMapping: (config) => defaultBoard(config as VikunjaConfig)?.kanbanMapping === true,
  create: (config) => new VikunjaIntegration(config as VikunjaConfig),
  /**
   * Four tasks at a time during a sync.
   *
   * Safe because the worker's `mutationQueue` serialises every write by key:
   * per task id for edits, moves, labels and deletes, and per project for
   * creates (which have no task id yet and share the project's `index`
   * counter). So the pool can only ever overlap writes that touch different
   * records — and it is worth having, because a push is up to three round
   * trips to a self-hosted instance and a sequential phase 1 on a board with a
   * dozen dirty tasks is a visible wait. Deliberately small: this is someone's
   * own server, not a CDN.
   */
  pushConcurrency: VIKUNJA_MUTATION_CONCURRENCY,
  /**
   * The one backend that can tell the widget it moved: its service worker
   * pulls on a `chrome.alarms` schedule and broadcasts the delta, so a task
   * someone changed in Vikunja shows up here without the page polling for it.
   */
  subscribeRemoteChanges: subscribeVikunjaRemoteChanges,
  /**
   * The instance's origin is optional (unknown at build time), so it can be
   * withdrawn after the wizard granted it — see `permission.ts` for why the
   * request has to start inside the click that asked for it.
   */
  recoverPermission: recoverVikunjaPermission,
  /**
   * Someone's own tracker is not a place to silently create the widget's
   * backlog in (ADR §Р10): tasks that predate the integration stay local
   * until the user imports them from the settings summary.
   */
  autoImportLocalTasks: false,
  /**
   * The scope of the default board, or `null` while no board is picked — in
   * which case the user stays on the picker step, exactly as a half-filled
   * single-board config used to keep them there.
   *
   * The pair still comes from one board and never from two halves: a board
   * cannot exist without both its project and its kanban view (see
   * `vikunjaBoardSchema`), so a scope that resolves nothing is no longer
   * representable.
   */
  getScope: (config) => {
    const board = defaultBoard(config as VikunjaConfig)
    if (!board) return null
    return { projectId: board.projectId, viewId: board.viewId }
  },
  withScope: (config, scope) => {
    const current = config as VikunjaConfig
    const pair = scopePair(scope)
    // Half a scope is not a board. Nothing is written for one — the config
    // comes back as it was, so a config with no board keeps the user on the
    // picker instead of gaining a board that addresses nothing.
    if (!pair) return current

    const known = current.boards.some((board) => board.projectId === pair.projectId)
    const boards: VikunjaBoard[] = known
      ? current.boards.map((board) =>
          board.projectId === pair.projectId ? { ...board, viewId: pair.viewId } : board,
        )
      : [
          ...current.boards,
          {
            projectId: pair.projectId,
            viewId: pair.viewId,
            // Everything else about the board is what the picker's caller
            // writes next (`pickScope` → the slice mirror) or what the
            // wizard produces; a fresh board starts kanban, like the first
            // one always did.
            name: '',
            containers: [],
            mapping: null,
            kanbanMapping: true,
          },
        ]

    // The first board picked becomes the default one; a later pick does not
    // move new tasks off the board the user chose for them.
    return { ...current, boards, defaultProjectId: current.defaultProjectId ?? pair.projectId }
  },
  ownsRef: isVikunjaRef,
}
