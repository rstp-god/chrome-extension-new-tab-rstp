import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { isShowcaseMode } from '@/services/chrome/runtime.ts'
import { TodoSettingsStepBody } from '@/widgets/Todo/components/settings/TodoSettingsStepBody.tsx'
import { resolveScope, useTodoStore } from '@/widgets/Todo/store/store.ts'
import {
  getDialogDescription,
  getDialogTitle,
  type DialogStep,
} from '@/widgets/Todo/utils/dialogStep.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Five-step state machine for the Todo settings dialog.
 *
 * The current step is computed from the persisted integration slice plus
 * two transient pieces of UI state:
 *
 *   - `pickedIntegrationName` — set when the user clicks an integration in
 *     the picker but hasn't finished the connect form yet.
 *   - `stepOverride` — set when the user clicks "Re-pick board" or "Edit
 *     mapping" from the summary view; lets us show an earlier step without
 *     wiping the persisted state immediately.
 *
 * Both transient values are reset to `null` either when the dialog closes
 * or when the natural computed step catches up to them. A single
 * `useEffect` handles all of that cleanup so the body of the component
 * stays a thin wrapper around the dialog shell.
 */
export function TodoSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation('todoWidget')
  const integration = useTodoStore((state) => state.integration)
  const showcase = isShowcaseMode()

  const [pickedIntegrationName, setPickedIntegrationName] = useState<string | null>(null)
  const [stepOverride, setStepOverride] = useState<DialogStep | null>(null)
  const previousIntegration = useRef(integration)

  const computedStep: DialogStep = useMemo(() => {
    if (!integration) {
      return pickedIntegrationName ? 'connect' : 'picker'
    }
    if (!resolveScope(integration)) return 'board'
    if (!integration.mapping) return 'mapping'
    return 'summary'
  }, [integration, pickedIntegrationName])

  // One effect for all transient cleanup: dialog close, picked-name that
  // outlived its purpose, and a stale step override.
  useEffect(() => {
    if (!open) {
      setPickedIntegrationName(null)
      setStepOverride(null)
      return
    }
    if (integration && pickedIntegrationName) {
      setPickedIntegrationName(null)
    }
    // An override also outlives its purpose the moment the user's action
    // lands in the store: re-picking a scope from the summary overrides to
    // 'board', but the computed step then jumps straight to 'mapping' and
    // would never match the override — leaving the user stuck on the picker.
    if (
      stepOverride &&
      (stepOverride === computedStep || previousIntegration.current !== integration)
    ) {
      setStepOverride(null)
    }
    previousIntegration.current = integration
  }, [open, integration, pickedIntegrationName, stepOverride, computedStep])

  const step: DialogStep = stepOverride ?? computedStep

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{getDialogTitle(step, t, pickedIntegrationName)}</DialogTitle>
          <DialogDescription>
            {getDialogDescription(step, t, pickedIntegrationName)}
          </DialogDescription>
        </DialogHeader>

        {showcase ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            {t('integrations.trello.showcase.disabled')}
          </div>
        ) : (
          <TodoSettingsStepBody
            step={step}
            pickedIntegrationName={pickedIntegrationName}
            onPickIntegration={setPickedIntegrationName}
            onCancelConnect={() => setPickedIntegrationName(null)}
            onLeaveScopePicker={() => {
              // From the board picker, "back" disconnects the integration
              // entirely and lands the user on the picker step.
              useTodoStore.getState().clearIntegration()
            }}
            onLeaveMapping={() => setStepOverride('board')}
            onEditMapping={() => setStepOverride('mapping')}
            onPickScope={() => setStepOverride('board')}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
