import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { TodoConfirmDialog } from '@/widgets/Todo/components/settings/TodoConfirmDialog.tsx'
import { TestId } from '@tests/constants/testIds.ts'

import { boardRemovals, describeBoardRemoval } from './boardRemoval.ts'
import { scopePair } from './scope.ts'
import { VikunjaBoardRow } from './VikunjaBoardRow.tsx'

import type {
  IntegrationErrorKey,
  RemoteScopeOption,
  ScopeStepProps,
} from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaBoard } from '@/widgets/Todo/store/store.ts'

/** A project the step can offer, whether it came from the account or the config. */
interface BoardOption {
  projectId: number
  viewId: number
  name: string
}

/**
 * Vikunja's own scope step: which of the account's projects this connection
 * syncs, and which of them new tasks are created in.
 *
 * It replaces the generic picker because the question is no longer "which
 * board" but "which boards": the config keeps a list, every one of them is
 * pulled and pushed, and one of them has to be the default. A single select
 * could express none of that.
 *
 * Prop-driven, like every component a descriptor points at: it never imports
 * the store (see `ScopeStepProps`) — the tasks it counts for the removal
 * warning and the three actions it calls all arrive as props.
 */
export function VikunjaBoardsStep({
  onBack,
  integration,
  adapter,
  tasks,
  errorKey,
  actions,
}: ScopeStepProps) {
  const { t } = useTranslation('todoWidget')
  const boardsKey = (leaf: string) => `integrations.vikunja.boards.${leaf}`

  // A mismatch would mean this descriptor was resolved for another
  // integration's slice; answering defensively beats casting through.
  const config = integration.name === 'vikunja' ? integration.config : null
  const boards = useMemo<VikunjaBoard[]>(() => config?.boards ?? [], [config])

  const [options, setOptions] = useState<RemoteScopeOption[] | null>(null)
  /**
   * A failure of this step's own requests — reading the account's projects,
   * or the buckets of a board being added. Kept here rather than pushed into
   * the store's `errorKey`, which belongs to the sync.
   */
  const [stepErrorKey, setStepErrorKey] = useState<IntegrationErrorKey | null>(null)
  const [checked, setChecked] = useState<number[]>(() => boards.map((board) => board.projectId))
  const [defaultId, setDefaultId] = useState<number | null>(
    () => config?.defaultProjectId ?? boards[0]?.projectId ?? null,
  )
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // One read of the account's projects per adapter: the list is what the
  // whole step is about, and the adapter is rebuilt whenever the credentials
  // or the config change.
  useEffect(() => {
    let cancelled = false
    void adapter.listScopes().then((out) => {
      if (cancelled) return
      if (out.ok) setOptions(out.value)
      else setStepErrorKey(out.errorKey)
    })
    return () => {
      cancelled = true
    }
  }, [adapter])

  /**
   * Every project worth a row: what the account offers, plus any board this
   * connection already syncs that the account no longer lists (archived, or
   * its kanban view deleted). Hiding the second kind would leave it synced
   * with no way to stop.
   */
  const rows = useMemo<BoardOption[]>(() => {
    const offered = (options ?? []).flatMap<BoardOption>((option) => {
      const pair = scopePair(option.scope)
      return pair ? [{ ...pair, name: option.name }] : []
    })
    const known = new Set(offered.map((option) => option.projectId))
    return [
      ...offered,
      ...boards
        .filter((board) => !known.has(board.projectId))
        .map(({ projectId, viewId, name }) => ({ projectId, viewId, name })),
    ]
  }, [options, boards])

  const removed = boards.filter((board) => !checked.includes(board.projectId))

  const toggle = (projectId: number, next: boolean) => {
    setChecked((current) =>
      next ? [...current, projectId] : current.filter((id) => id !== projectId),
    )
    // Unchecking the default leaves the star nowhere; the commit re-points it
    // at the first surviving board, and until then the row simply loses it.
    if (!next && defaultId === projectId) setDefaultId(null)
    if (next && defaultId === null) setDefaultId(projectId)
  }

  /**
   * Writes the new list of boards, after reading the buckets of every board
   * being added — they are what the mapping step maps, and a board added
   * without them would land the user on a wizard with nothing to map.
   *
   * A failed read stops everything: nothing is dropped, nothing is written,
   * and the error says which request refused.
   */
  const commit = async () => {
    if (!config) return

    setBusy(true)
    setStepErrorKey(null)
    try {
      const added: VikunjaBoard[] = []
      for (const row of rows) {
        if (!checked.includes(row.projectId)) continue
        if (boards.some((board) => board.projectId === row.projectId)) continue

        const out = await adapter.listContainers({
          projectId: row.projectId,
          viewId: row.viewId,
        })
        if (!out.ok) {
          setStepErrorKey(out.errorKey)
          return
        }
        added.push({
          projectId: row.projectId,
          viewId: row.viewId,
          name: row.name,
          containers: out.value,
          // Unmapped on purpose: `getSetupStep` reads exactly this to send
          // the user to the wizard for the board they have just added.
          mapping: null,
          kanbanMapping: true,
        })
      }

      const next = [...boards.filter((board) => checked.includes(board.projectId)), ...added]
      if (next.length === 0) return

      // The star must always point at a board that exists — the one the user
      // set, or the first one left.
      const nextDefault = next.some((board) => board.projectId === defaultId)
        ? defaultId
        : next[0].projectId

      // Tasks first: once the config no longer names a board, nothing can
      // find its tasks to drop them.
      for (const board of removed) actions.dropTasksOfProject(String(board.projectId))

      if (
        !actions.updateIntegrationConfig({
          ...config,
          boards: next,
          defaultProjectId: nextDefault,
        })
      ) {
        return
      }

      // The projects the widget offers are its boards, so the cache behind
      // the pills and the add dialog is stale until this runs.
      await actions.refreshContainers()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const handleContinue = () => {
    // Dropping a board takes its tasks out of the widget, which is the one
    // thing here the user cannot undo from this screen.
    if (removed.length > 0) {
      setConfirming(true)
      return
    }
    void commit()
  }

  const shownErrorKey = stepErrorKey ?? errorKey
  const loading = options === null && stepErrorKey === null

  return (
    <div data-testid={TestId.TodoBoardsStep} className="grid gap-4">
      <div className="grid gap-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t(boardsKey('title'))}
        </div>
        <p className="text-sm text-muted-foreground">{t(boardsKey('description'))}</p>
      </div>

      {loading && (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">{t(boardsKey('loading'))}</p>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      )}

      {!loading && rows.length === 0 && stepErrorKey === null && (
        <p className="text-sm text-muted-foreground">{t(boardsKey('empty'))}</p>
      )}

      {rows.length > 0 && (
        <ul className="grid gap-1 rounded-2xl border border-border bg-muted/20 p-1">
          {rows.map((row) => (
            <VikunjaBoardRow
              key={row.projectId}
              name={row.name}
              checked={checked.includes(row.projectId)}
              isDefault={defaultId === row.projectId}
              disabled={busy}
              onToggle={(next) => toggle(row.projectId, next)}
              onMakeDefault={() => setDefaultId(row.projectId)}
            />
          ))}
        </ul>
      )}

      {checked.length === 0 && rows.length > 0 && (
        <p className="text-sm text-muted-foreground">{t(boardsKey('keepOne'))}</p>
      )}

      {shownErrorKey && (
        <p className="text-sm text-destructive">{t(`integrations.errors.${shownErrorKey}`)}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          {t('integrations.actions.back')}
        </Button>
        <Button
          type="button"
          onClick={handleContinue}
          disabled={busy || checked.length === 0 || loading}
        >
          {t(boardsKey('continue'))}
        </Button>
      </div>

      <TodoConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(false)
        }}
        title={t(boardsKey('removeTitle'))}
        description={describeBoardRemoval(boardRemovals(removed, tasks), t)}
        confirmLabel={t(boardsKey('continue'))}
        destructive
        onConfirm={() => void commit()}
      />
    </div>
  )
}
