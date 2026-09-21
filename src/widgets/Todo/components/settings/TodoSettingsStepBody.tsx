import { Skeleton } from '@/components/ui/skeleton.tsx'
import { TodoSettingsScopePicker } from '@/widgets/Todo/components/settings/TodoSettingsScopePicker.tsx'
import { TodoSettingsConnect } from '@/widgets/Todo/components/settings/TodoSettingsConnect.tsx'
import { TodoSettingsMapping } from '@/widgets/Todo/components/settings/TodoSettingsMapping.tsx'
import { TodoSettingsPicker } from '@/widgets/Todo/components/settings/TodoSettingsPicker.tsx'
import { TodoSettingsSummary } from '@/widgets/Todo/components/settings/TodoSettingsSummary.tsx'
import {
  getIntegrationDescriptor,
  type TodoIntegration,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import type { DialogStep } from '@/widgets/Todo/utils/dialogStep.ts'
import { Suspense, useMemo } from 'react'

interface Props {
  step: DialogStep
  pickedIntegrationName: string | null
  onPickIntegration: (name: string) => void
  onCancelConnect: () => void
  onLeaveScopePicker: () => void
  onLeaveMapping: () => void
  onEditMapping: () => void
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
  onEditMapping,
  onPickScope,
}: Props) {
  const integration = useTodoStore((state) => state.integration)
  const descriptor = integration ? getIntegrationDescriptor(integration.name) : null

  const adapter = useMemo<TodoIntegration | null>(() => {
    if (!integration) return null
    return getIntegrationDescriptor(integration.name)?.create(integration.config) ?? null
    // The config object is replaced wholesale on every change (connect,
    // scope pick), so its identity covers every field the adapter reads.
  }, [integration?.name, integration?.config])

  switch (step) {
    case 'picker':
      return <TodoSettingsPicker onPick={onPickIntegration} />

    case 'connect':
      if (!pickedIntegrationName) return null
      return (
        <TodoSettingsConnect integrationName={pickedIntegrationName} onBack={onCancelConnect} />
      )

    case 'board':
      if (!adapter) return null
      return <TodoSettingsScopePicker adapter={adapter} onBack={onLeaveScopePicker} />

    case 'mapping': {
      // A backend may replace the generic table with its own step; most do
      // not need to. Such a step is loaded lazily (see the Vikunja
      // descriptor for why), hence the boundary.
      const MappingStep = descriptor?.MappingStep ?? TodoSettingsMapping
      return (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <MappingStep onBack={onLeaveMapping} />
        </Suspense>
      )
    }

    case 'summary':
      return <TodoSettingsSummary onEditMapping={onEditMapping} onPickScope={onPickScope} />
  }
}
