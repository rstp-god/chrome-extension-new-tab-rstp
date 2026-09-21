import type { IntegrationDescriptor } from './types.ts'

const modules = import.meta.glob<{ descriptor: IntegrationDescriptor }>('./*/index.ts', {
  eager: true,
})

/**
 * Null-prototype on purpose: the lookup key below comes from persisted
 * state, and on an ordinary object literal `'constructor'` or `'__proto__'`
 * would resolve to something that is not a descriptor at all.
 */
export const todoIntegrationRegistry: Record<string, IntegrationDescriptor> = Object.assign(
  Object.create(null) as Record<string, IntegrationDescriptor>,
  Object.fromEntries(Object.values(modules).map((m) => [m.descriptor.name, m.descriptor])),
)

export function getIntegrationDescriptor(
  name: string | null | undefined,
): IntegrationDescriptor | null {
  if (!name) return null
  return todoIntegrationRegistry[name] ?? null
}

export { getProjectPolicy, getSetupStep, isReadyToSync } from './setup.ts'

export type {
  BoardStatePatch,
  ConnectFormProps,
  IntegrationDescriptor,
  IntegrationErrorKey,
  IntegrationOutcome,
  IntegrationPushOp,
  MappingStepProps,
  Project,
  ProjectPolicy,
  PullContext,
  PullResult,
  PushContext,
  RemoteChangeEvent,
  RemoteContainer,
  RemoteScope,
  RemoteScopeOption,
  RemoteTaskRef,
  ScopeStepProps,
  SetupStep,
  StatusListMapping,
  SummaryExtrasActions,
  SummaryExtrasProps,
  TodoIntegration,
  TodoStatus,
  TrelloRemoteRef,
  VikunjaRemoteRef,
} from './types.ts'

export { isTrelloRef, isVikunjaRef, taskBelongsToBoard, TODO_STATUSES } from './types.ts'
