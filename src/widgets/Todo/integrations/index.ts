import type { IntegrationDescriptor } from './types.ts'

/**
 * Auto-built registry of Todo integrations. Mirrors the way `widgetRegistry`
 * is constructed in `src/types/widgets.ts` — each subfolder under
 * `src/widgets/Todo/integrations/<name>/` exports `{ descriptor }` from its
 * `index.ts` and is picked up here at build time by `import.meta.glob`.
 *
 * Adding a new integration: drop a folder, export a `descriptor`, done.
 */
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
