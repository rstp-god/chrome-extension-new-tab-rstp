/**
 * The three questions every part of the widget asks about a connection —
 * which screen is it waiting on, may a sync run, and what does it expect of a
 * task's project — answered in one place.
 *
 * They used to be answered inline, the same way each time: a `resolveScope`
 * here, an `integration.mapping` there, a `projectId ?? null` in the add
 * dialog. That worked while every backend kept one scope and one mapping on
 * the integration slice. A backend that syncs a *list* of boards cannot
 * answer any of them from those fields — Vikunja is waiting on the mapping
 * step while *any* board is unmapped, and the board a new task goes to is in
 * its config — so the answer became the descriptor's (`getSetupStep`,
 * `isReadyToSync`, `projectPolicy`) and these helpers are the only readers of
 * those hooks.
 *
 * Every one of them falls back to the rule the widget has always had, which
 * is exactly what a single-scope backend (Trello) needs — so a descriptor
 * that implements nothing keeps its behaviour to the letter.
 */

import type { IntegrationState } from '@/widgets/Todo/store/store.ts'

import type { IntegrationDescriptor, ProjectPolicy, SetupStep } from './types.ts'

/**
 * Trello's answer, and the widget's historical one: a project is optional,
 * the user may change it, and no backend-side default exists.
 *
 * A module constant rather than a fresh object per call, so a component may
 * depend on its identity.
 */
const DEFAULT_PROJECT_POLICY: ProjectPolicy = {
  required: false,
  defaultId: () => null,
  changeable: true,
}

/**
 * Which screen of the settings dialog this integration is waiting on.
 *
 * The fallback is the rule the dialog computed inline until the descriptor
 * could answer: no scope → pick one, no mapping → map it, otherwise the
 * summary. A descriptor the registry does not know (an integration removed
 * from the build, a hand-edited `name`) has no scope either, so it lands on
 * the picker — which is where the user can do something about it.
 */
export function getSetupStep(
  descriptor: IntegrationDescriptor | null,
  integration: IntegrationState,
): SetupStep {
  if (descriptor?.getSetupStep) return descriptor.getSetupStep(integration)
  if (!descriptor || descriptor.getScope(integration.config) === null) return 'board'
  if (integration.mapping === null) return 'mapping'
  return 'summary'
}

/**
 * May a sync do anything useful with this connection?
 *
 * Every gate that used to read `scope !== null && mapping !== null` goes
 * through here: the store's `syncNow` and its per-mutation pushes, the
 * widget's mount sync, its remote-change subscription and its back-online
 * flush, and the footer's badge and button.
 */
export function isReadyToSync(
  descriptor: IntegrationDescriptor | null,
  integration: IntegrationState,
): boolean {
  if (descriptor?.isReadyToSync) return descriptor.isReadyToSync(integration)
  if (!descriptor) return false
  return descriptor.getScope(integration.config) !== null && integration.mapping !== null
}

/** What this backend expects of a task's project — see `ProjectPolicy`. */
export function getProjectPolicy(descriptor: IntegrationDescriptor | null): ProjectPolicy {
  return descriptor?.projectPolicy ?? DEFAULT_PROJECT_POLICY
}
