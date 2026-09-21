import { TodoSettingsScopePicker } from '@/widgets/Todo/components/settings/TodoSettingsScopePicker.tsx'
import { TodoSettingsConnect } from '@/widgets/Todo/components/settings/TodoSettingsConnect.tsx'
import { TodoSettingsMapping } from '@/widgets/Todo/components/settings/TodoSettingsMapping.tsx'
import { TodoSettingsPicker } from '@/widgets/Todo/components/settings/TodoSettingsPicker.tsx'
import { TodoSettingsSummary } from '@/widgets/Todo/components/settings/TodoSettingsSummary.tsx'
import {
  getIntegrationDescriptor,
  type TodoIntegration,
} from '@/widgets/Todo/integrations/index.ts'
import { resolveScope, useTodoStore } from '@/widgets/Todo/store/store.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'
import type { DialogStep } from '@/widgets/Todo/utils/dialogStep.ts'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * A stable empty list, so a step that does not read the tasks never sees a
 * new array identity.
 */
const NO_TASKS: TodoTask[] = []

interface Props {
  step: DialogStep
  pickedIntegrationName: string | null
  onPickIntegration: (name: string) => void
  onCancelConnect: () => void
  onLeaveScopePicker: () => void
  onLeaveMapping: () => void
  /**
   * A step finished and persisted what it was opened for.
   *
   * One callback for both steps that have the notion: the dialog answers
   * them identically — drop the transient intent and show whatever the state
   * now implies — and which step it was is visible in that state.
   */
  onStepDone: () => void
  /** Which scope the mapping step was opened for, or `null` for "whatever is waiting". */
  mappingTarget: string | null
  onEditMapping: (target?: string) => void
  onPickScope: () => void
}

/**
 * Renders the body of `TodoSettingsDialog` for the current step. Pulled out
 * of the dialog itself so the dialog stays a thin wrapper around the state
 * machine and a `<Dialog>` shell.
 *
 * The adapter is re-instantiated whenever credentials or the scope change.
 * Construction is cheap (two strings), so we don't worry about caching it
 * beyond a single render pass.
 */
export function TodoSettingsStepBody({
  step,
  pickedIntegrationName,
  onPickIntegration,
  onCancelConnect,
  onLeaveScopePicker,
  onLeaveMapping,
  onStepDone,
  mappingTarget,
  onEditMapping,
  onPickScope,
}: Props) {
  const {
    integration,
    errorKey,
    setMapping,
    updateIntegrationConfig,
    refreshContainers,
    dropTasksOfProject,
    syncNow,
  } = useTodoStore(
    useShallow((state) => ({
      integration: state.integration,
      errorKey: state.errorKey,
      setMapping: state.setMapping,
      updateIntegrationConfig: state.updateIntegrationConfig,
      refreshContainers: state.refreshContainers,
      dropTasksOfProject: state.dropTasksOfProject,
      syncNow: state.syncNow,
    })),
  )
  /**
   * Subscribed only where it is read (the scope step, which says what
   * dropping a scope would cost). Everywhere else the dialog would re-render
   * on every keystroke of the list behind it, for nothing — and the array's
   * identity is stable, so the other steps see no change at all.
   */
  const tasks = useTodoStore((state) => (step === 'board' ? state.tasks : NO_TASKS))
  const descriptor = integration ? getIntegrationDescriptor(integration.name) : null

  // A descriptor's UI is prop-driven (it must not import the store), so the
  // actions its steps may call are bundled here once — one bundle for both,
  // since a scope step and a mapping step need the same three.
  const stepActions = useMemo(
    () => ({
      setMapping,
      updateIntegrationConfig,
      refreshContainers,
      dropTasksOfProject,
      syncNow,
    }),
    [setMapping, updateIntegrationConfig, refreshContainers, dropTasksOfProject, syncNow],
  )

  const adapter = useMemo<TodoIntegration | null>(() => {
    if (!integration) return null
    return getIntegrationDescriptor(integration.name)?.create(integration.config) ?? null
    // The config object is replaced wholesale on every change (connect,
    // scope pick), so its identity covers every field the adapter reads.
  }, [integration?.name, integration?.config])

  const scope = useMemo(() => resolveScope(integration), [integration])

  switch (step) {
    case 'picker':
      return <TodoSettingsPicker onPick={onPickIntegration} />

    case 'connect':
      if (!pickedIntegrationName) return null
      return (
        <TodoSettingsConnect integrationName={pickedIntegrationName} onBack={onCancelConnect} />
      )

    case 'board': {
      // Same rule as the mapping step below: a backend may bring its own
      // scope step, and the shared picker — one select and a Continue — is
      // what every backend with a single scope needs.
      const ScopeStep = descriptor?.ScopeStep ?? TodoSettingsScopePicker
      if (!adapter || !integration) return null
      return (
        <ScopeStep
          onBack={onLeaveScopePicker}
          onDone={onStepDone}
          integration={integration}
          adapter={adapter}
          tasks={tasks}
          errorKey={errorKey}
          actions={stepActions}
        />
      )
    }

    case 'mapping': {
      // A backend may replace the generic table with its own step; most do
      // not need to. Either way the step is handed everything it needs, so a
      // descriptor's component never reaches into the store itself.
      const MappingStep = descriptor?.MappingStep ?? TodoSettingsMapping
      if (!integration || !adapter || !scope) return null
      return (
        <MappingStep
          onBack={onLeaveMapping}
          onDone={onStepDone}
          integration={integration}
          adapter={adapter}
          scope={scope}
          errorKey={errorKey}
          target={mappingTarget ?? undefined}
          actions={stepActions}
        />
      )
    }

    case 'summary':
      return <TodoSettingsSummary onEditMapping={onEditMapping} onPickScope={onPickScope} />
  }
}
