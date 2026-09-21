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
  RemoteContainer,
  StatusListMapping,
  TodoStatus,
} from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaBoard, VikunjaConfig } from '@/widgets/Todo/store/store.ts'
import type { MissingColumn } from './VikunjaMissingColumnsPanel.tsx'

/**
 * What this step freezes and what it re-reads, because the difference is the
 * whole of its state management:
 *
 * - **frozen at mount** — `plan`, the list of boards this run walks. It is
 *   computed from "which boards are still unmapped", and every save changes
 *   that answer: walking the live one would renumber the header mid-wizard
 *   and skip the board the user is about to be shown.
 * - **live** — `integration.config`, which is re-read on every render and is
 *   what every write is built from. The boards inside `plan` are therefore
 *   only identities (`projectId`), never a source of truth about their
 *   contents.
 * - **live, with a local override** — the buckets. A board carries the ones
 *   the config knows; creating a column re-reads them from the instance and
 *   keeps the answer in `freshLists` until the config write lands.
 */
interface MappingPlan {
  boards: VikunjaBoard[]
  /** The summary named a board this config no longer has. */
  targetMissing: boolean
}

/**
 * The boards this run of the wizard is about, in order.
 *
 * Three cases, and they are the three ways the step is reached: the user
 * named a board from the summary (`target`), the connection has boards
 * waiting to be mapped (a fresh connect, or a board just added), or neither
 * — in which case the wizard is being re-opened for the board the settings UI
 * is showing.
 */
function mappingPlan(config: VikunjaConfig, target: string | undefined): MappingPlan {
  if (target !== undefined) {
    const named = config.boards.filter((board) => String(board.projectId) === target)
    // No fallback for a target that names nothing: "map this board" about a
    // board that is gone is a question with no answer, and quietly mapping a
    // different one would be the wrong answer to it.
    return { boards: named, targetMissing: named.length === 0 }
  }

  const unmapped = config.boards.filter((board) => board.mapping === null)
  if (unmapped.length > 0) return { boards: unmapped, targetMissing: false }

  const fallback = defaultBoard(config)
  return { boards: fallback ? [fallback] : [], targetMissing: false }
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
  onDone,
  integration,
  adapter,
  errorKey,
  target,
  actions,
}: MappingStepProps) {
  const { t } = useTranslation('todoWidget')

  const config = integration.name === 'vikunja' ? integration.config : null

  /** Mount-time only — see the note at the top of the file. */
  const [frozen] = useState<MappingPlan>(() =>
    config ? mappingPlan(config, target) : { boards: [], targetMissing: false },
  )

  /** Which board of the queue is on screen. */
  const [position, setPosition] = useState(0)
  const planned = frozen.boards[position] ?? null

  /**
   * The board as the config has it *now*, matched by id — the planned entry
   * is a mount-time snapshot, and the one thing it is trusted for is naming
   * which board this is.
   */
  const board =
    planned === null
      ? null
      : (config?.boards.find((entry) => entry.projectId === planned.projectId) ?? null)

  const wasFlat = board !== null && !board.kanbanMapping

  /**
   * The saved mapping, unless the board is flat: a flat mapping points four
   * statuses at the same bucket, which the table would (correctly) read as a
   * pile of conflicts. Someone re-opening this step from flat mode wants a
   * fresh suggestion, not their placeholder back — the section below says
   * which mode is actually in effect.
   */
  const [draft, setDraft] = useState<StatusListMapping>(() =>
    board && board.kanbanMapping && board.mapping
      ? board.mapping
      : suggestMapping(board?.containers ?? []),
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
  /** The board on screen left the connection while the wizard was on it. */
  const [boardGone, setBoardGone] = useState(false)

  /**
   * The buckets this step read for itself after creating columns.
   *
   * `actions.refreshContainers` re-reads the *default* board, which is not
   * necessarily the one on screen, so the step asks the adapter directly and
   * writes the answer onto the board it is mapping.
   */
  const [freshLists, setFreshLists] = useState<Record<number, RemoteContainer[]>>({})
  const buckets = board === null ? [] : (freshLists[board.projectId] ?? board.containers)

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
   * same connection that has been through the wizard *and* uses its buckets.
   * A flat board's mapping is a placeholder pointing four statuses at one
   * bucket — copying it would hand this board four conflicts. The first
   * match is enough; a menu of boards to copy from would be a second wizard.
   */
  const source =
    config?.boards.find(
      (candidate) =>
        candidate.projectId !== board?.projectId &&
        candidate.mapping !== null &&
        candidate.kanbanMapping,
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

  /**
   * Writes a patch onto the board on screen, never onto the default one.
   *
   * Answers `false` when it wrote nothing — either the board has left the
   * connection (another tab, or this dialog's own boards step) or the config
   * did not validate. Both mean the caller must not move on as if it had.
   */
  const patchBoard = (patch: Partial<VikunjaBoard>): boolean => {
    if (!config || !board) return false
    if (!config.boards.some((entry) => entry.projectId === board.projectId)) {
      setBoardGone(true)
      return false
    }
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
    if (!createContainer || !board || busy) return

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
          // A refused cache write is worth saying: the buckets exist on the
          // instance, the draft below points at them, and the widget's own
          // copy of the board is now behind.
          if (!patchBoard({ containers: reread.value })) failure = failure ?? 'unknown'
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

  /**
   * Moves to the next board, or — after the last — syncs and hands the dialog
   * back its own step machine.
   *
   * The sync is this step's parting duty. Everything it wrote went through
   * `updateIntegrationConfig`, which persists and nothing more; the
   * connection has just become syncable and the widget behind the dialog
   * would otherwise show a list nobody has read yet.
   */
  const advance = () => {
    const next = position + 1
    if (next >= frozen.boards.length) {
      void actions.syncNow()
      onDone()
      return
    }

    // Read off the live config, never off the frozen plan: the plan names
    // which board comes next and nothing more (see the note at the top of
    // the file), and its snapshot of that board's buckets may be minutes old.
    const upcoming =
      config?.boards.find((entry) => entry.projectId === frozen.boards[next].projectId) ?? null

    setPosition(next)
    setConfirmCompleted(false)
    setCreatedNote(false)
    setCreateErrorKey(null)
    setDraft(
      upcoming && upcoming.kanbanMapping && upcoming.mapping
        ? upcoming.mapping
        : suggestMapping(upcoming?.containers ?? []),
    )
  }

  /**
   * Accepts flat mode for this board: only "done" round-trips.
   *
   * Synchronous, and no `busy` around it: the write is a store `set` that has
   * either happened or been refused by the time the next line runs, so there
   * is no window for a second click to fall into. `busy` guards the one
   * handler that awaits the network (`handleCreateColumns`).
   */
  const handleSkipToFlat = () => {
    if (!flat || busy) return
    // Both halves in one write: a flat mapping under a kanban flag would sync
    // four statuses into one bucket, and the flag without the mapping would
    // describe a mode the board is not in.
    if (!patchBoard({ kanbanMapping: false, mapping: flat })) return
    advance()
  }

  const handleSave = () => {
    if (blocked || busy) return
    // Saving a real bucket mapping leaves flat mode behind.
    if (!patchBoard({ kanbanMapping: true, mapping: draft })) return
    advance()
  }

  /** "Same as <board>": the other board's mapping, translated by column name. */
  const handleCopyFrom = () => {
    if (!source) return
    setCreatedNote(false)
    setDraft(copyMappingByNames(source, buckets))
  }

  // The summary named a board this connection no longer has — nothing here
  // could be about it, so the step says so and hands back.
  if (frozen.targetMissing || (planned !== null && board === null)) {
    return (
      <div data-testid={TestId.TodoMappingStep} className="grid gap-4">
        <p role="alert" className="text-sm text-destructive">
          {t('integrations.vikunja.mapping.boardGone')}
        </p>
        <div>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('integrations.actions.back')}
          </Button>
        </div>
      </div>
    )
  }

  if (!board) return null

  return (
    <div data-testid={TestId.TodoMappingStep} className="grid gap-4">
      {(frozen.boards.length > 1 || target !== undefined || (config?.boards.length ?? 0) > 1) && (
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('integrations.vikunja.mapping.boardHeader', {
            n: position + 1,
            total: frozen.boards.length,
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

      {boardGone && (
        <p role="alert" className="text-sm text-destructive">
          {t('integrations.vikunja.mapping.boardGone')}
        </p>
      )}

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
