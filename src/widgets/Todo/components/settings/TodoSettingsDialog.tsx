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
 * three transient pieces of UI state:
 *
 *   - `pickedIntegrationName` — set when the user clicks an integration in
 *     the picker but hasn't finished the connect form yet.
 *   - `stepOverride` — set when the user asks for an earlier step from the
 *     summary ("Change boards", "Columns"); lets us show it without wiping
 *     the persisted state.
 *   - `mappingTarget` — which scope that mapping override is about.
 *
 * **An override ends when the step says it is done**, not when the store
 * moves. A step that writes several times before it is finished — the bucket
 * wizard creating the missing columns, then saving the mapping, then walking
 * to the next board — would otherwise be torn down mid-way by the very write
 * it made: the integration's reference changes, the computed step answers
 * something else, and the user is ejected to a screen they did not ask for.
 * So the only things that retire an override are `onStepDone`, the
 * integration disappearing (or being replaced by another backend), and the
 * dialog closing.
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
  /**
   * Which connection the transient state belongs to. The *name*, not the
   * slice: a config write replaces the object on every edit, and an override
   * that could not survive that would not survive the step that set it.
   */
  const previousIntegrationName = useRef(integration?.name ?? null)

  const clearIntent = () => {
    setStepOverride(null)
    setMappingTarget(null)
  }

  const computedStep: DialogStep = useMemo(() => {
    if (!integration) {
      return pickedIntegrationName ? 'connect' : 'picker'
    }
    // Which of the three configuring steps a connection is on is the
    // descriptor's answer: a backend with several boards is on the mapping
    // step while *any* of them is unmapped, which no slice field can say.
    return getSetupStep(getIntegrationDescriptor(integration.name), integration)
  }, [integration, pickedIntegrationName])

  // One effect for all transient cleanup: dialog close, a picked-name that
  // outlived its purpose, and an override whose connection is gone.
  useEffect(() => {
    if (!open) {
      setPickedIntegrationName(null)
      clearIntent()
      return
    }
    if (integration && pickedIntegrationName) {
      setPickedIntegrationName(null)
    }
    // Only a connection that is no longer the same connection: disconnected,
    // or replaced by another backend. Anything finer would fire on the
    // step's own writes — see the note above the component.
    const name = integration?.name ?? null
    if (previousIntegrationName.current !== name) {
      clearIntent()
      previousIntegrationName.current = name
    }
  }, [open, integration, pickedIntegrationName])

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
              // two ways in. From the summary's "Change boards" there is an
              // override to drop and a settled state to return to, so back is
              // cancel — dropping the whole connection there would be a
              // destructive answer to a button labelled "Back".
              if (stepOverride === 'board') {
                clearIntent()
                return
              }
              // Reached by connecting: there is no earlier step inside this
              // integration, and an integration without a scope syncs nothing,
              // so back is out — disconnect and land on the picker.
              // Nothing here waits for the storage writes; the step the
              // dialog shows follows from the state, which is already set.
              void useTodoStore.getState().clearIntegration()
            }}
            // Back from the mapping step is the user's own choice of where to
            // go, not a guess from the state: the step behind it is the list
            // of scopes, whether or not everything happens to be mapped.
            onLeaveMapping={() => {
              setMappingTarget(null)
              setStepOverride('board')
            }}
            onStepDone={clearIntent}
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
