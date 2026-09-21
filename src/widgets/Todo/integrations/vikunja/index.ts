import { isVikunjaRef } from '@/widgets/Todo/integrations/types.ts'

import { sendVikunjaMessage } from './bridge.ts'
import { isReservedLabel, labelToProject, vikunjaTaskToTodo } from './mapping.ts'
import {
  vikunjaBucketSummaryListSchema,
  vikunjaBucketSummarySchema,
  vikunjaConnectInfoSchema,
  vikunjaLabelSummaryListSchema,
  vikunjaProjectSummaryListSchema,
  vikunjaPullResultSchema,
} from './schema.ts'
import { VikunjaConnectForm } from './VikunjaConnectForm.tsx'
import { VikunjaMappingStep } from './VikunjaMappingStep.tsx'

import type {
  VikunjaBucketSummary,
  VikunjaRequest,
  VikunjaWire,
} from '@/background/vikunja/messages.ts'
import type {
  IntegrationDescriptor,
  IntegrationOutcome,
  Project,
  PullContext,
  PullResult,
  RemoteContainer,
  RemoteScope,
  RemoteScopeOption,
  RemoteTaskRef,
  TodoIntegration,
} from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask, VikunjaConfig } from '@/widgets/Todo/store/store.ts'
import type { z } from 'zod'

/** Task 6 still owes the write path. */
const NOT_IMPLEMENTED: IntegrationOutcome<never> = { ok: false, errorKey: 'unknown' }

/** A scope that does not address a project *and* a view addresses nothing. */
const NO_SCOPE: IntegrationOutcome<never> = { ok: false, errorKey: 'notFound' }

/**
 * `RemoteScope` is an open record, so a Vikunja scope may arrive with a
 * missing, string or unparseable id. Total by construction: anything that is
 * not a finite number yields `null` rather than `NaN` travelling into a
 * persisted config.
 */
function scopeNumber(raw: unknown): number | null {
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
  // Vikunja ids start at 1, so a zero, a negative or a fractional value is a
  // corrupt scope rather than an unusual one — and `Number('')` is 0, which
  // would otherwise sail through as a valid id.
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

/** Both halves of a Vikunja scope, or `null` if either is unusable. */
function scopePair(scope: RemoteScope): { projectId: number; viewId: number } | null {
  const projectId = scopeNumber(scope.projectId)
  const viewId = scopeNumber(scope.viewId)
  if (projectId === null || viewId === null) return null
  return { projectId, viewId }
}

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
   * The labels are fetched alongside it because a task carries only label
   * *ids* and the adapter has to know which of them are real projects rather
   * than the reserved `energy:` / `mood:` ones. A failure there is
   * propagated instead of defaulting to "everything counts": defaulting would
   * stamp a reserved label onto tasks as their project, which is precisely
   * what the reserved list exists to prevent.
   */
  async pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>> {
    const pair = scopePair(ctx.scope)
    if (!pair) return NO_SCOPE

    const labels = await this.listLabels()
    if (!labels.ok) return labels

    const pull = await this.send(
      { type: 'vikunja', op: 'pull', cfg: this.wire(), ...pair },
      vikunjaPullResultSchema,
    )
    if (!pull.ok) return pull

    // One pass over the known refs instead of a scan per pulled task: a
    // board with a few hundred tasks would otherwise be quadratic.
    const localIdByTaskId = new Map<number, string>()
    for (const [localId, ref] of Object.entries(ctx.knownRefs)) {
      if (isVikunjaRef(ref)) localIdByTaskId.set(ref.taskId, localId)
    }

    const projectIds = new Set(labels.value.map((label) => String(label.id)))
    const taskContext = {
      mapping: ctx.mapping,
      localIdByTaskId,
      knownStatuses: ctx.knownStatuses,
      // `kanbanMapping: false` means the user skipped the bucket wizard and
      // only `completed` round-trips.
      flat: !this.config.kanbanMapping,
      projectIds,
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

  // Task 6: read-modify-write plus the bucket move.
  async pushTask(): Promise<IntegrationOutcome<RemoteTaskRef>> {
    return NOT_IMPLEMENTED
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
  create: (config) => new VikunjaIntegration(config as VikunjaConfig),
  /**
   * The scope is the pair, not either half: a project without a view cannot
   * address a task list, so a half-filled config keeps the user on the
   * picker step instead of producing a scope nothing can resolve.
   */
  getScope: (config) => {
    const { projectId, viewId } = config as VikunjaConfig
    if (projectId === null || viewId === null) return null
    return { projectId, viewId }
  },
  withScope: (config, scope) => {
    const pair = scopePair(scope)
    // Atomic for the same reason: half a scope is worse than none, because
    // `getScope` would keep rejecting it without ever saying why.
    return {
      ...(config as VikunjaConfig),
      projectId: pair?.projectId ?? null,
      viewId: pair?.viewId ?? null,
    }
  },
  ownsRef: isVikunjaRef,
}
