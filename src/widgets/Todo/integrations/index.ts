import type { IntegrationDescriptor } from './types.ts'

const modules = import.meta.glob<{ descriptor: IntegrationDescriptor }>('./*/index.ts', {
  eager: true,
})

export const todoIntegrationRegistry: Record<string, IntegrationDescriptor> = Object.fromEntries(
  Object.values(modules).map((m) => [m.descriptor.name, m.descriptor]),
)

export function getIntegrationDescriptor(
  name: string | null | undefined,
): IntegrationDescriptor | null {
  if (!name) return null
  return todoIntegrationRegistry[name] ?? null
}

export type {
  ConnectFormProps,
  IntegrationDescriptor,
  IntegrationErrorKey,
  IntegrationOutcome,
  IntegrationPushOp,
  Project,
  PullContext,
  PullResult,
  PushContext,
  RemoteBoard,
  RemoteList,
  RemoteTaskRef,
  StatusListMapping,
  TodoIntegration,
  TodoStatus,
} from './types.ts'

export { TODO_STATUSES } from './types.ts'
