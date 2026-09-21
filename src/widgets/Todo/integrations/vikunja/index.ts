import { isVikunjaRef } from '@/widgets/Todo/integrations/types.ts'

import { sendVikunjaMessage } from './bridge.ts'
import { vikunjaConnectInfoSchema } from './schema.ts'
import { VikunjaConnectForm } from './VikunjaConnectForm.tsx'

import type {
  IntegrationDescriptor,
  IntegrationOutcome,
  Project,
  PullResult,
  RemoteContainer,
  RemoteScopeOption,
  RemoteTaskRef,
  TodoIntegration,
} from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaConfig } from '@/widgets/Todo/store/store.ts'

/** Every op that tasks 5 and 6 still owe. */
const NOT_IMPLEMENTED: IntegrationOutcome<never> = { ok: false, errorKey: 'unknown' }

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
    const response = await sendVikunjaMessage<unknown>({
      type: 'vikunja',
      op: 'connect',
      cfg: { baseUrl: this.config.baseUrl, token: this.config.token },
    })
    if (!response.ok) return { ok: false, errorKey: response.errorKey }

    // The bridge validates the envelope only; the payload is ours to check.
    const parsed = vikunjaConnectInfoSchema.safeParse(response.value)
    if (!parsed.success) return { ok: false, errorKey: 'unknown' }

    return { ok: true, value: { userHandle: parsed.data.userHandle } }
  }

  /** Nothing to release: no client, no socket, no timer. */
  disconnect(): void {}

  // Task 5: projects + kanban views over the bridge's `listProjects`.
  async listScopes(): Promise<IntegrationOutcome<RemoteScopeOption[]>> {
    return NOT_IMPLEMENTED
  }

  /**
   * The stubs below declare no parameters on purpose: a method may accept
   * fewer arguments than the interface it implements, and naming arguments
   * nothing reads would only invite a reviewer to wonder what happened to
   * them. The real signatures arrive with the implementations.
   */

  // Task 5: buckets of the chosen view, `isTerminal` from `done_bucket_id`.
  async listContainers(): Promise<IntegrationOutcome<RemoteContainer[]>> {
    return NOT_IMPLEMENTED
  }

  // Task 5: labels as Todo projects.
  async listProjects(): Promise<IntegrationOutcome<Project[]>> {
    return NOT_IMPLEMENTED
  }

  // Task 6: paged pull of the view endpoint (buckets with nested tasks).
  async pullTasks(): Promise<IntegrationOutcome<PullResult>> {
    return NOT_IMPLEMENTED
  }

  // Task 6: read-modify-write plus the bucket move.
  async pushTask(): Promise<IntegrationOutcome<RemoteTaskRef>> {
    return NOT_IMPLEMENTED
  }
}

export const descriptor: IntegrationDescriptor = {
  name: 'vikunja',
  titleI18nKey: 'todoWidget:integrations.vikunja.title',
  descriptionI18nKey: 'todoWidget:integrations.vikunja.description',
  ConnectForm: VikunjaConnectForm,
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
    const projectId = scopeNumber(scope.projectId)
    const viewId = scopeNumber(scope.viewId)
    // Atomic for the same reason: half a scope is worse than none, because
    // `getScope` would keep rejecting it without ever saying why.
    const usable = projectId !== null && viewId !== null
    return {
      ...(config as VikunjaConfig),
      projectId: usable ? projectId : null,
      viewId: usable ? viewId : null,
    }
  },
  ownsRef: isVikunjaRef,
}
