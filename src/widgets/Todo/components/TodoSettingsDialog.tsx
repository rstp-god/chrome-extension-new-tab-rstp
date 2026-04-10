import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { isShowcaseMode } from '@/services/chrome/runtime.ts'
import { TodoSettingsBoardPicker } from '@/widgets/Todo/components/TodoSettingsBoardPicker.tsx'
import { TodoSettingsConnect } from '@/widgets/Todo/components/TodoSettingsConnect.tsx'
import { TodoSettingsMapping } from '@/widgets/Todo/components/TodoSettingsMapping.tsx'
import { TodoSettingsPicker } from '@/widgets/Todo/components/TodoSettingsPicker.tsx'
import { TodoSettingsSummary } from '@/widgets/Todo/components/TodoSettingsSummary.tsx'
import {
  getIntegrationDescriptor,
  type TodoIntegration,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type DialogStep = 'picker' | 'connect' | 'board' | 'mapping' | 'summary'

/**
 * Five-step state machine for the Todo settings dialog. The step is computed
 * from the persisted integration slice plus two transient pieces of UI state:
 *
 *   - `pickedIntegrationName` — set after the user clicks an integration in
 *     the picker, before they finish the connect form.
 *   - `stepOverride` — set when the user clicks "Re-pick board" or "Edit
 *     mapping" from the summary view; lets us show an earlier step without
 *     wiping the persisted state immediately.
 *
 * Both transient pieces are reset when the dialog closes.
 */
export function TodoSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation('todoWidget')
  const integration = useTodoStore((state) => state.integration)
  const showcase = isShowcaseMode()

  const [pickedIntegrationName, setPickedIntegrationName] = useState<string | null>(null)
  const [stepOverride, setStepOverride] = useState<DialogStep | null>(null)

  const computedStep: DialogStep = useMemo(() => {
    if (!integration) {
      return pickedIntegrationName ? 'connect' : 'picker'
    }
    if (!integration.config.boardId) return 'board'
    if (!integration.mapping) return 'mapping'
    return 'summary'
  }, [integration, pickedIntegrationName])

  // When the user successfully connects, the picked-name override is no
  // longer needed (computedStep advances to 'board'). Drop it.
  useEffect(() => {
    if (integration && pickedIntegrationName) {
      setPickedIntegrationName(null)
    }
  }, [integration, pickedIntegrationName])

  // Keep stepOverride in sync with the natural step — once they match, the
  // override is redundant. This also clears stale overrides when the
  // underlying integration state changes (e.g. board re-picked).
  useEffect(() => {
    if (stepOverride && stepOverride === computedStep) {
      setStepOverride(null)
    }
  }, [stepOverride, computedStep])

  // Reset all transient UI state when the dialog closes.
  useEffect(() => {
    if (!open) {
      setPickedIntegrationName(null)
      setStepOverride(null)
    }
  }, [open])

  const step: DialogStep = stepOverride ?? computedStep

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{getDialogTitle(step, t)}</DialogTitle>
          <DialogDescription>{getDialogDescription(step, t)}</DialogDescription>
        </DialogHeader>

        {showcase ? (
          <ShowcaseDisabledNotice />
        ) : (
          <StepBody
            step={step}
            pickedIntegrationName={pickedIntegrationName}
            onPickIntegration={(name) => setPickedIntegrationName(name)}
            onCancelConnect={() => setPickedIntegrationName(null)}
            onStepOverride={setStepOverride}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function getDialogTitle(step: DialogStep, t: (key: string) => string): string {
  switch (step) {
    case 'picker':
      return t('integrations.picker.title')
    case 'connect':
      return t('integrations.trello.connect.title')
    case 'board':
      return t('integrations.trello.board.title')
    case 'mapping':
      return t('integrations.trello.mapping.title')
    case 'summary':
      return t('integrations.trello.summary.title')
  }
}

function getDialogDescription(step: DialogStep, t: (key: string) => string): string {
  switch (step) {
    case 'picker':
      return t('integrations.picker.description')
    case 'connect':
      return t('integrations.trello.connect.description')
    case 'board':
      return t('integrations.trello.board.description')
    case 'mapping':
      return t('integrations.trello.mapping.description')
    case 'summary':
      return t('settings.description')
  }
}

function ShowcaseDisabledNotice() {
  const { t } = useTranslation('todoWidget')
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
      {t('integrations.trello.showcase.disabled')}
    </div>
  )
}

interface StepBodyProps {
  step: DialogStep
  pickedIntegrationName: string | null
  onPickIntegration: (name: string) => void
  onCancelConnect: () => void
  onStepOverride: (step: DialogStep | null) => void
}

function StepBody({
  step,
  pickedIntegrationName,
  onPickIntegration,
  onCancelConnect,
  onStepOverride,
}: StepBodyProps) {
  const integration = useTodoStore((state) => state.integration)

  // The adapter is re-instantiated whenever credentials or boardId change.
  // Construction is cheap (two strings), so we don't worry about caching it
  // beyond a single render pass.
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

  if (step === 'picker') {
    return <TodoSettingsPicker onPick={onPickIntegration} />
  }

  if (step === 'connect' && pickedIntegrationName) {
    return <TodoSettingsConnect integrationName={pickedIntegrationName} onBack={onCancelConnect} />
  }

  if (step === 'board' && adapter) {
    return (
      <TodoSettingsBoardPicker
        adapter={adapter}
        onBack={() => {
          // From the board picker, "back" disconnects the integration entirely
          // and lands the user on the picker step.
          useTodoStore.getState().clearIntegration()
        }}
      />
    )
  }

  if (step === 'mapping') {
    return <TodoSettingsMapping onBack={() => onStepOverride('board')} />
  }

  if (step === 'summary') {
    return (
      <TodoSettingsSummary
        onEditMapping={() => onStepOverride('mapping')}
        onPickBoard={() => onStepOverride('board')}
      />
    )
  }

  return null
}
