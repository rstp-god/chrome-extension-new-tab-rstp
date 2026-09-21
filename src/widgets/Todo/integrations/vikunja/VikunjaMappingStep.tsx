import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'
import { TestId } from '@tests/constants/testIds.ts'

import {
  copyMappingByNames,
  flatModeMapping,
  suggestMapping,
  validateMapping,
} from './autoMapping.ts'
import { defaultBoard, withBoardPatch } from './boards.ts'
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
import type { VikunjaBoard, VikunjaConfig } from '@/widgets/Todo/store/store.ts'
import type { MissingColumn } from './VikunjaMissingColumnsPanel.tsx'

/**
 * The boards this run of the wizard is about, in order.
 *
 * Three cases, and they are the three ways the step is reached: the user
 * named a board from the summary (`target`), the connection has boards
 * waiting to be mapped (a fresh connect, or a board just added), or neither
 * — in which case the wizard is being re-opened for the board the settings UI
 * is showing.
 */
function mappingQueue(config: VikunjaConfig, target: string | undefined): VikunjaBoard[] {
  if (target !== undefined) {
    const named = config.boards.filter((board) => String(board.projectId) === target)
    if (named.length > 0) return named
  }

  const unmapped = config.boards.filter((board) => board.mapping === null)
  if (unmapped.length > 0) return unmapped

  const fallback = defaultBoard(config)
  return fallback ? [fallback] : []
}

/**
 * Vikunja's own mapping step, walked once per board.
 *
 * It differs from the generic table in three ways, all of them forced by the
 * backend: entering the view's done bucket sets `done` server-side (so that
 * bucket can only mean `completed`), a typical board has no `struggle` or
 * `deleted` column at all, and a user who does not want such columns in their
 * tracker needs a way out — flat mode.
 *
 * With several boards it is also a queue: every board has its own buckets, so
 * the same status maps to a different id on each, and the step saves one
 * board and moves to the next rather than asking for one answer that would
 * only be right for one of them. Two boards built from the same template are
 * the common case, which is what "same as ..." is for.
 *
 * Prop-driven, like every component a descriptor points at: it never imports
 * the store (see `MappingStepProps`).
 */
export function VikunjaMappingStep({
  onBack,
  integration,
  adapter,
  errorKey,
  target,
  actions,
}: MappingStepProps) {
  const { t } = useTranslation('todoWidget')

  const config = integration.name === 'vikunja' ? integration.config : null
  const queue = useMemo(() => (config ? mappingQueue(config, target) : []), [config, target])

  /**
   * Which board of the queue is on screen. An index rather than an id: the
   * queue is computed from the config, and saving a board's mapping removes
   * it from the "unmapped" queue — so the index is the only thing that keeps
   * its meaning across that write (see `board` below, which reads the queue
   * as it was when the step mounted).
   */
  const [position, setPosition] = useState(0)
  /**
   * The queue as it looked when the wizard started.
   *
   * Frozen on purpose: `mappingQueue` answers "what is still unmapped", which
   * changes under the step's feet on every save. Walking the live answer
   * would renumber the header mid-wizard ("Board 2 of 2" becoming "Board 1 of
   * 1") and skip boards.
   */
  const [plan] = useState(queue)
  const board = plan[position] ?? null

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

  /**
   * The buckets this step read for itself after creating columns.
   *
   * `actions.refreshContainers` re-reads the *default* board, which is not
   * necessarily the one on screen, so the step asks the adapter directly and
   * writes the answer onto the board it is mapping.
   */
  const [freshLists, setFreshLists] = useState<Record<number, typeof lists>>({})
  const buckets = board !== null ? (freshLists[board.projectId] ?? lists) : []

  const problems = useMemo(() => validateMapping(draft, buckets), [draft, buckets])

  /** Only the two the wizard can actually build (see the constant). */
  const missingColumns: MissingColumn[] = problems.missing
    .filter((status): status is 'struggle' | 'deleted' => status in VIKUNJA_MISSING_COLUMN_TITLES)
    .map((status) => ({ status, title: t(VIKUNJA_MISSING_COLUMN_TITLES[status]) }))

  const canCreate = missingColumns.length > 0 && Boolean(adapter.createContainer)

  /**
   * The flat fallback, or `null` on a view with no done bucket — where not
   * even "done" could round-trip, so the option is not offered at all.
   */
  const flat = useMemo(() => flatModeMapping(buckets), [buckets])

  /**
   * A board whose mapping this one could be copied from: another board of the
   * same connection that has been through the wizard already. The first one
   * is enough — a menu of boards to copy from would be a second wizard.
   */
  const source =
    config?.boards.find(
      (candidate) => candidate.projectId !== board?.projectId && candidate.mapping !== null,
    ) ?? null

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

  /** Writes a patch onto the board on screen, never onto the default one. */
  const patchBoard = (patch: Partial<VikunjaBoard>): boolean => {
    if (!config || !board) return false
    return actions.updateIntegrationConfig(withBoardPatch(config, board.projectId, patch))
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
    if (!createContainer || !board) return

    const scope = { projectId: board.projectId, viewId: board.viewId }
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
        const reread = await adapter.listContainers(scope)
        if (reread.ok) {
          setFreshLists((current) => ({ ...current, [board.projectId]: reread.value }))
          patchBoard({ containers: reread.value })
        }
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

  /** Moves to the next board, or hands the dialog back its own step machine. */
  const advance = () => {
    const next = position + 1
    if (next >= plan.length) {
      onBack()
      return
    }
    const upcoming = plan[next]
    setPosition(next)
    setConfirmCompleted(false)
    setCreatedNote(false)
    setCreateErrorKey(null)
    setDraft(
      upcoming.kanbanMapping && upcoming.mapping
        ? upcoming.mapping
        : suggestMapping(upcoming.containers),
    )
  }

  /** Accepts flat mode for this board: only "done" round-trips. */
  const handleSkipToFlat = () => {
    if (!flat) return
    // Both halves in one write: a flat mapping under a kanban flag would sync
    // four statuses into one bucket, and the flag without the mapping would
    // describe a mode the board is not in.
    if (!patchBoard({ kanbanMapping: false, mapping: flat })) return
    advance()
  }

  const handleSave = () => {
    if (blocked) return
    // Saving a real bucket mapping leaves flat mode behind.
    if (!patchBoard({ kanbanMapping: true, mapping: draft })) return
    advance()
  }

  /** "Same as <board>": the other board's mapping, translated by column name. */
  const handleCopyFrom = () => {
    if (!source) return
    setCreatedNote(false)
    setDraft(copyMappingByNames(source, buckets).mapping)
  }

  if (!board) return null

  return (
    <div data-testid={TestId.TodoMappingStep} className="grid gap-4">
      {(plan.length > 1 || target !== undefined) && (
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('integrations.vikunja.mapping.boardHeader', {
            n: position + 1,
            total: plan.length,
            name: board.name,
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('integrations.vikunja.mapping.suggestedHint')}
        </p>
        {source && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCopyFrom}
            disabled={busy}
          >
            {t('integrations.vikunja.mapping.copyFrom', { name: source.name })}
          </Button>
        )}
      </div>

      {shownErrorKey && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {t(`integrations.errors.${shownErrorKey}`)}
        </p>
      )}

      <VikunjaMappingRows
        buckets={buckets}
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
        onSkip={handleSkipToFlat}
      />

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          {t('integrations.actions.back')}
        </Button>
        <Button type="button" onClick={handleSave} disabled={blocked || busy}>
          {t('integrations.mapping.save')}
        </Button>
      </div>
    </div>
  )
}
