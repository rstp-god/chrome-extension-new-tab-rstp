import { TodoSettingsBoardPicker } from '@/widgets/Todo/components/settings/TodoSettingsBoardPicker.tsx'
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
import { useMemo } from 'react'

interface Props {
  step: DialogStep
  pickedIntegrationName: string | null
  onPickIntegration: (name: string) => void
  onCancelConnect: () => void
  onLeaveBoardPicker: () => void
  onLeaveMapping: () => void
  onEditMapping: () => void
  onPickBoard: () => void
}

/**
 * Renders the body of `TodoSettingsDialog` for the current step. Pulled out
 * of the dialog itself so the dialog stays a thin wrapper around the state
 * machine and a `<Dialog>` shell.
 *
 * The adapter is re-instantiated whenever credentials or boardId change.
 * Construction is cheap (two strings), so we don't worry about caching it
 * beyond a single render pass.
 */
export function TodoSettingsStepBody({
  step,
  pickedIntegrationName,
  onPickIntegration,
  onCancelConnect,
  onLeaveBoardPicker,
  onLeaveMapping,
  onEditMapping,
  onPickBoard,
}: Props) {
  const integration = useTodoStore((state) => state.integration)

  const adapter = useMemo<TodoIntegration | null>(() => {
    if (!integration) return null
    const descriptor = getIntegrationDescriptor(integration.name)
    if (!descriptor) return null
    return descriptor.create(integration.config)
  }, [
    integration?.name,
    integration?.config.apiKey,
    integration?.config.token,
    integration?.config.boardId,
  ])

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
      return <TodoSettingsBoardPicker adapter={adapter} onBack={onLeaveBoardPicker} />

    case 'mapping':
      return <TodoSettingsMapping onBack={onLeaveMapping} />

    case 'summary':
      return <TodoSettingsSummary onEditMapping={onEditMapping} onPickBoard={onPickBoard} />
  }
}
