import { VIKUNJA_MUTATION_CONCURRENCY } from '@/background/vikunja/messages.ts'
import { isVikunjaRef } from '@/widgets/Todo/integrations/types.ts'
import { urlHost } from '@/widgets/Todo/utils/url.ts'

import { defaultBoard, hasUnmappedBoard, withDefaultBoardPatch } from './boards.ts'
import { sendVikunjaMessage } from './bridge.ts'
import { vikunjaTaskToTodo } from './mapping.ts'
import { recoverVikunjaPermission } from './permission.ts'
import { getVikunjaBoardPillClass } from './projectStyles.ts'
import { pushVikunjaTask } from './push.ts'
import { scopePair } from './scope.ts'
import {
  vikunjaBucketSummaryListSchema,
  vikunjaBucketSummarySchema,
  vikunjaConnectInfoSchema,
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
  RemoteContainer,
  RemoteScope,
  RemoteScopeOption,
  RemoteTaskRef,
  SetupStep,
  TodoIntegration,
} from '@/widgets/Todo/integrations/types.ts'
import type {
  IntegrationState,
  TodoTask,
  VikunjaBoard,
  VikunjaConfig,
} from '@/widgets/Todo/store/store.ts'
import type { z } from 'zod'

/** A scope that does not address a project *and* a view addresses nothing. */
const NO_SCOPE: IntegrationOutcome<never> = { ok: false, errorKey: 'notFound' }

/**
 * A scope this config has no board for.
 *
 * `mappingIncomplete` rather than `notFound`: the scope names a real project,
 * it is *this connection* that has nothing stored about it — no columns, no
 * mapping, no mode — and every one of those is what the settings step the
 * error sends the user to is for. Reported instead of guessing: without the
 * board there is no honest answer to "is this board flat", and assuming
 * either way would run the operation under rules the user never chose.
 */
const NO_BOARD: IntegrationOutcome<never> = { ok: false, errorKey: 'mappingIncomplete' }

/**
 * A board whose bucket wizard was never finished.
 *
 * The mapping lives on the board (task 2), so this is a question the adapter
 * can answer on its own instead of trusting whatever the store passed in
 * `ctx.mapping` — which, with several boards, could only ever be one board's.
 * Flat mode is not this case: it has no bucket mapping *by design* and reads
 * `done` instead.
 */
const NO_MAPPING: IntegrationOutcome<never> = { ok: false, errorKey: 'mappingIncomplete' }

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
   * The connected boards, as the widget's projects.
   *
   * A Vikunja project *is* the board — a task lives in one, and that is the
   * only grouping the instance has that the widget can honour on a write. So
   * this answers from `config.boards` and spends no request: the titles were
   * cached when the boards were picked, and the ids are the project ids the
   * refs already carry.
   *
   * It used to answer with the instance's labels, which was the closest thing
   * to Trello's per-board tags. That never survived contact with several
   * boards — a label says nothing about which project a task belongs to — and
   * the pills the user sees now name the board a task is on.
   *
   * The scope parameter the contract declares is deliberately not taken: the
   * answer is about the whole connection.
   */
  async listProjects(): Promise<IntegrationOutcome<Project[]>> {
    return { ok: true, value: this.config.boards.map(boardToProject) }
  }

  /**
   * One full read of the view: every bucket, every task, done included — and
   * exactly one message on the wire.
   *
   * It used to read the instance's labels alongside it, to tell which of a
   * task's label ids was meant to be its project. There is nothing to ask any
   * more: a task's project is the board it lives in, which the caller already
   * knows before it sends anything.
   */
  async pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>> {
    // The board, not `ctx.scope`: with a list of boards there is no single
    // scope the store could name, so the adapter reads the one it syncs out
    // of its own config. Task 3 loops over all of them here.
    const board = defaultBoard(this.config)
    if (!board) return NO_BOARD
    // Kanban without a mapping cannot place a single task; flat mode never
    // looks at one.
    if (board.kanbanMapping && board.mapping === null) return NO_MAPPING
    const pair = { projectId: board.projectId, viewId: board.viewId }

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

    const taskContext = {
      // The board's own mapping — `ctx.mapping` is the slice mirror, which
      // this backend stopped keeping (task 2).
      mapping: board.mapping,
      localIdByTaskId,
      knownStatuses: ctx.knownStatuses,
      // `kanbanMapping: false` means the user skipped the bucket wizard for
      // this board and only `completed` round-trips.
      flat: !board.kanbanMapping,
      // The board every task here belongs to: what its ref records, and what
      // its project is.
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
  ): Promise<IntegrationOutcome<RemoteTaskRef>> {
    // The `PushContext` the contract declares is deliberately not taken —
    // same reason as in `pullTasks`: the board carries the mode and the
    // columns a write has to obey, and a write made under another board's
    // rules moves the user's task to the wrong place. Task 3 resolves the
    // board of the task being pushed; today only the default one is synced,
    // so every ref is on it.
    const board = defaultBoard(this.config)
    if (!board) return NO_BOARD

    return pushVikunjaTask(
      {
        cfg: this.wire(),
        // `kanbanMapping: false` means the user skipped the bucket wizard for
        // this board and only `completed` round-trips.
        flat: !board.kanbanMapping,
        mapping: board.mapping,
        send: (request, schema) => this.send(request, schema),
      },
      { task, op, scope: { projectId: board.projectId, viewId: board.viewId } },
    )
  }

  // ---------- internals ----------

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

/**
 * A board as the widget's project: the project id it is addressed by, the
 * title cached when it was picked, and a pill colour derived from that id
 * (a Vikunja project carries no colour of its own).
 */
function boardToProject(board: VikunjaBoard): Project {
  return {
    id: String(board.projectId),
    name: board.name,
    pillClassName: getVikunjaBoardPillClass(board.projectId),
  }
}

/**
 * The config of a Vikunja slice, or `null` for a slice that is not ours.
 *
 * The hooks below are handed the whole `IntegrationState`, whose union the
 * store discriminates by `name` — and a mismatch would mean this descriptor
 * was resolved for another integration's slice, which is worth answering
 * defensively rather than casting through.
 */
function configOf(integration: IntegrationState): VikunjaConfig | null {
  return integration.name === 'vikunja' ? integration.config : null
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
  /** The board, the background-pull period, and the flat-mode caveat. */
  SummaryExtras: VikunjaSummaryExtras,
  /**
   * Which screen a connection is waiting on, read off the boards rather than
   * off "the" scope and "the" mapping.
   *
   * Two differences from the default rule, both of them about the list being
   * a list: no board at all sends the user to the picker (there is nothing to
   * map yet), and **any** unmapped board sends them to the wizard — even when
   * the default board is mapped, because a sync could not place that other
   * board's tasks.
   */
  getSetupStep: (integration): SetupStep => {
    const config = configOf(integration)
    if (!config || config.boards.length === 0) return 'board'
    return hasUnmappedBoard(config) ? 'mapping' : 'summary'
  },
  /**
   * A Vikunja task lives *in* a project: that is what a board is, so one is
   * always required, a new task gets the default board's, and moving a task
   * to another project is a different operation from anything the widget
   * offers (it would mean recreating the task on another board).
   */
  projectPolicy: {
    required: true,
    defaultId: (config) => {
      const board = defaultBoard(config as VikunjaConfig)
      return board ? String(board.projectId) : null
    },
    changeable: false,
  },
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
   *
   * Takes the whole slice because the broadcasts worth acting on are the ones
   * about *any* connected board — see `subscribe.ts`.
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
          board.projectId === pair.projectId
            ? {
                ...board,
                viewId: pair.viewId,
                // Another view means other buckets, so the cached columns and
                // the mapping built from them describe a board that is no
                // longer the one being synced. Keeping them would map
                // statuses onto bucket ids from a different view.
                containers: [],
                mapping: null,
              }
            : board,
        )
      : [
          ...current.boards,
          {
            projectId: pair.projectId,
            viewId: pair.viewId,
            // Everything else about the board is written next, by the store's
            // `withBoardState` from what the picker just read; a fresh board
            // starts kanban, like the first one always did.
            name: '',
            containers: [],
            mapping: null,
            kanbanMapping: true,
          },
        ]

    // Picking a scope is the user saying which board they want synced, so it
    // becomes the default one — the widget shows one board until task 3, and
    // leaving the previous pick in place would answer the picker with "the
    // board you just chose is not the board you see".
    return { ...current, boards, defaultProjectId: pair.projectId }
  },
  /**
   * The cached name, columns and mapping belong to the board they were read
   * from, so they are written into it rather than only onto the slice.
   *
   * The default board is the one being synced (task 3 adds the switcher), and
   * a config with no board at all comes back untouched — see
   * `withDefaultBoardPatch`.
   */
  withBoardState: (config, patch) =>
    withDefaultBoardPatch(config as VikunjaConfig, {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.containers === undefined ? {} : { containers: patch.containers }),
      ...(patch.mapping === undefined ? {} : { mapping: patch.mapping }),
    }),
  ownsRef: isVikunjaRef,
}
