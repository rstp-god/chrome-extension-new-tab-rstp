import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { isShowcaseMode } from '@/services/chrome/runtime.ts'
import { TodoSettingsStepBody } from '@/widgets/Todo/components/settings/TodoSettingsStepBody.tsx'
import { getIntegrationDescriptor, getSetupStep } from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import {
  getDialogDescription,
  getDialogTitle,
  type DialogStep,
} from '@/widgets/Todo/utils/dialogStep.ts'
import { TestId } from '@tests/constants/testIds.ts'
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
  /**
   * Which scope the mapping step was opened for, when the user named one.
   *
   * Transient beside `stepOverride` and cleared with it, because it describes
   * the very same intent: "map *this* board" is a step override plus its
   * subject, and an override that outlived its purpose would take a stale
   * subject with it.
   */
  const [mappingTarget, setMappingTarget] = useState<string | null>(null)
  const previousIntegration = useRef(integration)

  const computedStep: DialogStep = useMemo(() => {
    if (!integration) {
      return pickedIntegrationName ? 'connect' : 'picker'
    }
    // Which of the three configuring steps a connection is on is the
    // descriptor's answer: a backend with several boards is on the mapping
    // step while *any* of them is unmapped, which no slice field can say.
    return getSetupStep(getIntegrationDescriptor(integration.name), integration)
  }, [integration, pickedIntegrationName])

  // One effect for all transient cleanup: dialog close, picked-name that
  // outlived its purpose, and a stale step override.
  useEffect(() => {
    if (!open) {
      setPickedIntegrationName(null)
      setStepOverride(null)
      setMappingTarget(null)
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
      setMappingTarget(null)
    }
    previousIntegration.current = integration
  }, [open, integration, pickedIntegrationName, stepOverride, computedStep])

  const step: DialogStep = stepOverride ?? computedStep

  // Which integration the wording belongs to: the persisted one once it
  // exists, otherwise the one being connected right now. `null` only on the
  // picker step.
  const integrationName = integration?.name ?? pickedIntegrationName

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={TestId.TodoSettingsDialogContent} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{getDialogTitle(step, t, integrationName)}</DialogTitle>
          <DialogDescription>{getDialogDescription(step, t, integrationName)}</DialogDescription>
        </DialogHeader>

        {showcase ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            {t('integrations.showcase.disabled')}
          </div>
        ) : (
          <TodoSettingsStepBody
            step={step}
            pickedIntegrationName={pickedIntegrationName}
            onPickIntegration={setPickedIntegrationName}
            onCancelConnect={() => setPickedIntegrationName(null)}
            onLeaveScopePicker={() => {
              // "Back" means "undo the step I took to get here", and there are
              // two ways in. From the summary's "Change board / project" the
              // integration already has a scope and a settled state to return
              // to, so back is cancel — dropping the whole connection there
              // would be a destructive answer to a button labelled "Back".
              // `computedStep` is the step the *state* is on, whatever the
              // override shows — so anything but `board` means there is a
              // scope (and a settled state) to go back to.
              if (stepOverride === 'board' && computedStep !== 'board') {
                setStepOverride(null)
                return
              }
              // Reached by connecting: there is no earlier step inside this
              // integration, and an integration without a scope syncs nothing,
              // so back is out — disconnect and land on the picker.
              // Nothing here waits for the storage writes; the step the
              // dialog shows follows from the state, which is already set.
              void useTodoStore.getState().clearIntegration()
            }}
            onLeaveMapping={() => {
              setMappingTarget(null)
              // Same rule as the scope picker's "Back": it undoes the step
              // that led here. Opened from the summary for one board — or
              // reached by a wizard that has just mapped the last board — the
              // state is settled, so back is out of the override and onto the
              // summary the computed step now answers. Otherwise a board is
              // still unmapped and the step behind this one is the board list.
              if (computedStep === 'summary') {
                setStepOverride(null)
                return
              }
              setStepOverride('board')
            }}
            mappingTarget={mappingTarget}
            onEditMapping={(target) => {
              setStepOverride('mapping')
              setMappingTarget(target ?? null)
            }}
            onPickScope={() => setStepOverride('board')}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
