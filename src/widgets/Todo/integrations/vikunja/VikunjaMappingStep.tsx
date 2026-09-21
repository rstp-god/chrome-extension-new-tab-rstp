import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'
import { TestId } from '@tests/constants/testIds.ts'

import { flatModeMapping, suggestMapping, validateMapping } from './autoMapping.ts'
import { defaultBoard, withDefaultBoardPatch } from './boards.ts'
import { VIKUNJA_MISSING_COLUMN_TITLES } from './constants.ts'
import { VikunjaFlatModeSection } from './VikunjaFlatModeSection.tsx'
import { VikunjaMappingProblems } from './VikunjaMappingProblems.tsx'
import { VikunjaMappingRows } from './VikunjaMappingRows.tsx'
import { VikunjaMissingColumnsPanel } from './VikunjaMissingColumnsPanel.tsx'

import type {
  IntegrationErrorKey,
  MappingStepProps,
  StatusListMapping,
  TodoStatus,
} from '@/widgets/Todo/integrations/types.ts'
import type { MissingColumn } from './VikunjaMissingColumnsPanel.tsx'

/**
 * Vikunja's own mapping step.
 *
 * It differs from the generic table in three ways, all of them forced by the
 * backend: entering the view's done bucket sets `done` server-side (so that
 * bucket can only mean `completed`), a typical board has no `struggle` or
 * `deleted` column at all, and a user who does not want such columns in their
 * tracker needs a way out — flat mode.
 *
 * Prop-driven, like every component a descriptor points at: it never imports
 * the store (see `MappingStepProps`).
 */
export function VikunjaMappingStep({
  onBack,
  integration,
  adapter,
  scope,
  errorKey,
  actions,
}: MappingStepProps) {
  const { t } = useTranslation('todoWidget')

  /**
   * Everything this step is about belongs to the board, not to the connection
   * — its buckets, its mapping and whether the buckets are used at all. The
   * slice's own copies are gone (task 2), and the default board is the one
   * the widget syncs until task 4 makes this step iterate them.
   */
  const board = integration.name === 'vikunja' ? defaultBoard(integration.config) : null
  const lists = board?.containers ?? []
  const wasFlat = board !== null && !board.kanbanMapping

  /**
   * The saved mapping, unless the board is flat: a flat mapping points four
   * statuses at the same bucket, which the table would (correctly) read as a
   * pile of conflicts. Someone re-opening this step from flat mode wants a
   * fresh suggestion, not their placeholder back — the section below says
   * which mode is actually in effect.
   */
  const [draft, setDraft] = useState<StatusListMapping>(() =>
    !wasFlat && board?.mapping ? board.mapping : suggestMapping(lists),
  )
  const [confirmCompleted, setConfirmCompleted] = useState(false)
  const [createdNote, setCreatedNote] = useState(false)
  const [busy, setBusy] = useState(false)
  /**
   * A failed column creation is this step's own business — it never reached
   * the store, so it is kept here rather than written into the store's
   * `errorKey` behind the actions' back.
   */
  const [createErrorKey, setCreateErrorKey] = useState<IntegrationErrorKey | null>(null)

  const problems = useMemo(() => validateMapping(draft, lists), [draft, lists])

  /** Only the two the wizard can actually build (see the constant). */
  const missingColumns: MissingColumn[] = problems.missing
    .filter((status): status is 'struggle' | 'deleted' => status in VIKUNJA_MISSING_COLUMN_TITLES)
    .map((status) => ({ status, title: t(VIKUNJA_MISSING_COLUMN_TITLES[status]) }))

  const canCreate = missingColumns.length > 0 && Boolean(adapter.createContainer)

  /**
   * The flat fallback, or `null` on a view with no done bucket — where not
   * even "done" could round-trip, so the option is not offered at all.
   */
  const flat = useMemo(() => flatModeMapping(lists), [lists])

  // A local failure wins: it is the most recent thing that happened.
  const shownErrorKey = createErrorKey ?? errorKey

  const blocked =
    problems.conflicts.length > 0 ||
    problems.terminalMisused.length > 0 ||
    problems.missing.length > 0 ||
    (problems.completedNotTerminal && !confirmCompleted)

  /** Any edit invalidates the "columns created" line, which described a past draft. */
  const editDraft = (next: (current: StatusListMapping) => StatusListMapping) => {
    setCreatedNote(false)
    setDraft(next)
  }

  const addBucketToStatus = (status: TodoStatus, bucketId: string) => {
    editDraft((current) => ({
      ...current,
      [status]: current[status].includes(bucketId)
        ? current[status]
        : [...current[status], bucketId],
    }))
  }

  const removeBucketFromStatus = (status: TodoStatus, bucketId: string) => {
    editDraft((current) => ({
      ...current,
      [status]: current[status].filter((id) => id !== bucketId),
    }))
  }

  /**
   * Creates the missing columns one at a time, then re-reads the buckets and
   * points the empty rows at the new ids. Sequential rather than parallel:
   * Vikunja assigns a position per creation, and two racing `PUT`s land in an
   * arbitrary board order.
   *
   * A failure half-way through still refreshes and still writes the ids that
   * *were* created into the draft. Those buckets exist on the user's instance
   * now; forgetting them would leave the widget unaware of columns it made,
   * and the next attempt would create a second copy.
   */
  const handleCreateColumns = async () => {
    const createContainer = adapter.createContainer
    if (!createContainer) return

    setBusy(true)
    setCreateErrorKey(null)
    const created: Partial<Record<TodoStatus, string>> = {}
    let failure: IntegrationErrorKey | null = null

    try {
      for (const column of missingColumns) {
        const out = await createContainer.call(adapter, scope, column.title)
        if (!out.ok) {
          failure = out.errorKey
          break
        }
        created[column.status] = out.value.id
      }

      if (Object.keys(created).length > 0) {
        await actions.refreshContainers()
        setCreatedNote(failure === null)
        setDraft((current) => {
          const next = { ...current }
          for (const [status, id] of Object.entries(created)) {
            next[status as TodoStatus] = [id]
          }
          return next
        })
      }
      setCreateErrorKey(failure)
    } finally {
      setBusy(false)
    }
  }

  /** Accepts flat mode: only "done" round-trips, the rest stays local. */
  const handleSkipToFlat = async () => {
    if (integration.name !== 'vikunja' || !flat) return

    setBusy(true)
    try {
      // Bail before the mapping if the config write was refused: a flat
      // mapping under a kanban config would sync four statuses into one
      // bucket.
      //
      // Both writes land on the board: the mode here, and the mapping through
      // `setMapping` below — the store routes it there for a descriptor that
      // keeps its state per board.
      const next = withDefaultBoardPatch(integration.config, { kanbanMapping: false })
      if (!actions.updateIntegrationConfig(next)) return
      setCreatedNote(false)
      await actions.setMapping(flat)
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async () => {
    if (blocked) return

    setBusy(true)
    try {
      // Saving a real bucket mapping leaves flat mode behind — and if that
      // write is refused, the mapping must not be saved either.
      if (wasFlat && integration.name === 'vikunja') {
        const next = withDefaultBoardPatch(integration.config, { kanbanMapping: true })
        if (!actions.updateIntegrationConfig(next)) return
      }
      await actions.setMapping(draft)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid={TestId.TodoMappingStep} className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {t('integrations.vikunja.mapping.suggestedHint')}
      </p>

      {shownErrorKey && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {t(`integrations.errors.${shownErrorKey}`)}
        </p>
      )}

      <VikunjaMappingRows
        buckets={lists}
        draft={draft}
        onAdd={addBucketToStatus}
        onRemove={removeBucketFromStatus}
      />

      <VikunjaMappingProblems
        problems={problems}
        confirmCompleted={confirmCompleted}
        onConfirmCompleted={setConfirmCompleted}
      />

      {createdNote && (
        <p role="alert" className="text-sm text-emerald-500">
          {t('integrations.vikunja.mapping.created')}
        </p>
      )}

      {canCreate && (
        <VikunjaMissingColumnsPanel
          columns={missingColumns}
          busy={busy}
          onCreate={() => void handleCreateColumns()}
        />
      )}

      <VikunjaFlatModeSection
        active={wasFlat}
        available={flat !== null}
        busy={busy}
        onSkip={() => void handleSkipToFlat()}
      />

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          {t('integrations.actions.back')}
        </Button>
        <Button type="button" onClick={() => void handleSave()} disabled={blocked || busy}>
          {t('integrations.mapping.save')}
        </Button>
      </div>
    </div>
  )
}
