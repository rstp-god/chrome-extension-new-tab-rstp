import { Button } from '@/components/ui/button.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { MappingStatusRow } from '@/widgets/Todo/components/settings/MappingStatusRow.tsx'
import { getIntegrationDescriptor, TODO_STATUSES } from '@/widgets/Todo/integrations/index.ts'
import { resolveScope, useTodoStore } from '@/widgets/Todo/store/store.ts'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { flatModeMapping, suggestMapping, validateMapping } from './autoMapping.ts'
import { VIKUNJA_MISSING_COLUMN_TITLES } from './constants.ts'
import { VikunjaMissingColumnsPanel } from './VikunjaMissingColumnsPanel.tsx'

import type {
  IntegrationErrorKey,
  MappingStepProps,
  StatusListMapping,
  TodoIntegration,
  TodoStatus,
} from '@/widgets/Todo/integrations/index.ts'
import type { IntegrationState } from '@/widgets/Todo/store/store.ts'
import type { MissingColumn } from './VikunjaMissingColumnsPanel.tsx'

/**
 * A ready adapter for the active integration, or `null` when there is none.
 * Construction is a couple of strings, so it is rebuilt whenever the config
 * object is replaced — which is whenever anything in it changed.
 */
function adapterOf(integration: IntegrationState | null): TodoIntegration | null {
  if (!integration) return null
  const descriptor = getIntegrationDescriptor(integration.name)
  return descriptor?.create(integration.config) ?? null
}

/**
 * Vikunja's own mapping step.
 *
 * It differs from the generic table in three ways, all of them forced by the
 * backend: the done bucket is the only column that can carry `completed`
 * (moving a task there flips `done` server-side), a typical board is missing
 * the `struggle` and `deleted` columns entirely, and a user who does not want
 * those columns needs a way out — flat mode.
 */
export function VikunjaMappingStep({ onBack }: MappingStepProps) {
  const { t } = useTranslation('todoWidget')
  const { integration, setMapping, updateIntegrationConfig, refreshContainers, errorKey } =
    useTodoStore(
      useShallow((state) => ({
        integration: state.integration,
        setMapping: state.setMapping,
        updateIntegrationConfig: state.updateIntegrationConfig,
        refreshContainers: state.refreshContainers,
        errorKey: state.errorKey,
      })),
    )

  const lists = useMemo(() => integration?.lists ?? [], [integration?.lists])
  const listNameById = useMemo(() => new Map(lists.map((list) => [list.id, list.name])), [lists])

  const adapter = useMemo(
    () => adapterOf(integration),
    // The config object is replaced wholesale on every change, so its
    // identity covers every field the adapter reads.
    [integration?.name, integration?.config],
  )
  const scope = useMemo(() => resolveScope(integration), [integration])

  const wasFlat = integration?.name === 'vikunja' && !integration.config.kanbanMapping

  /**
   * The persisted mapping, unless the config is flat: a flat mapping points
   * four statuses at the same bucket, which the table would (correctly) read
   * as a pile of conflicts. Someone re-opening this step from flat mode wants
   * a fresh suggestion, not their placeholder back.
   */
  const [draft, setDraft] = useState<StatusListMapping>(() =>
    !wasFlat && integration?.mapping ? integration.mapping : suggestMapping(lists),
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

  const ownerByListId = useMemo(
    () =>
      new Map<string, TodoStatus>(
        TODO_STATUSES.flatMap((status) => draft[status].map((id) => [id, status] as const)),
      ),
    [draft],
  )

  /** Only the two the wizard can actually build (see the constant). */
  const missingColumns: MissingColumn[] = problems.missing
    .filter((status): status is 'struggle' | 'deleted' => status in VIKUNJA_MISSING_COLUMN_TITLES)
    .map((status) => ({ status, title: t(VIKUNJA_MISSING_COLUMN_TITLES[status]) }))

  const canCreate = missingColumns.length > 0 && Boolean(adapter?.createContainer)

  // A local failure wins: it is the most recent thing that happened.
  const shownErrorKey = createErrorKey ?? errorKey

  const blocked =
    problems.conflicts.length > 0 ||
    problems.deletedOnTerminal ||
    problems.missing.length > 0 ||
    (problems.completedNotTerminal && !confirmCompleted)

  const addListToStatus = (status: TodoStatus, listId: string) => {
    setDraft((current) => ({
      ...current,
      [status]: current[status].includes(listId) ? current[status] : [...current[status], listId],
    }))
  }

  const removeListFromStatus = (status: TodoStatus, listId: string) => {
    setDraft((current) => ({
      ...current,
      [status]: current[status].filter((id) => id !== listId),
    }))
  }

  /**
   * Creates the missing columns one at a time, then re-reads the buckets and
   * points the empty rows at the new ids. Sequential rather than parallel:
   * Vikunja assigns a position per creation, and two racing `PUT`s land in an
   * arbitrary board order.
   */
  const handleCreateColumns = async () => {
    if (!adapter?.createContainer || !scope) return

    setBusy(true)
    setCreateErrorKey(null)
    const created: Partial<Record<TodoStatus, string>> = {}
    for (const column of missingColumns) {
      const out = await adapter.createContainer(scope, column.title)
      if (!out.ok) {
        setBusy(false)
        setCreateErrorKey(out.errorKey)
        return
      }
      created[column.status] = out.value.id
    }

    // The store owns the bucket cache, so it re-reads it; the draft then
    // points at ids the persisted `lists` really contains.
    await refreshContainers()
    setCreatedNote(true)
    setDraft((current) => {
      const next = { ...current }
      for (const [status, id] of Object.entries(created)) {
        next[status as TodoStatus] = [id]
      }
      return next
    })
    setBusy(false)
  }

  /**
   * The flat fallback, or `null` on a view with no done bucket — where not
   * even "done" could round-trip, so the option is not offered at all.
   */
  const flat = useMemo(() => flatModeMapping(lists), [lists])

  /** Accepts flat mode: only "done" round-trips, the rest stays local. */
  const handleSkipToFlat = async () => {
    if (!integration || integration.name !== 'vikunja' || !flat) return

    setBusy(true)
    updateIntegrationConfig({ ...integration.config, kanbanMapping: false })
    await setMapping(flat)
    setBusy(false)
  }

  const handleSave = async () => {
    if (blocked || !integration) return

    setBusy(true)
    // Saving a real bucket mapping leaves flat mode behind.
    if (wasFlat && integration.name === 'vikunja') {
      updateIntegrationConfig({ ...integration.config, kanbanMapping: true })
    }
    await setMapping(draft)
    setBusy(false)
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {t('integrations.vikunja.mapping.suggestedHint')}
      </p>

      {wasFlat && (
        <p className="rounded-2xl border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          {t('integrations.vikunja.mapping.flatNotice')}
        </p>
      )}

      {shownErrorKey && (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`integrations.errors.${shownErrorKey}`)}
        </p>
      )}

      <div className="grid gap-2">
        {TODO_STATUSES.map((status) => (
          <MappingStatusRow
            key={status}
            status={status}
            statusLabel={t(`integrations.trello.mapping.row.${status}`)}
            selectedListIds={draft[status]}
            listNameById={listNameById}
            availableLists={lists}
            isSelectedInOther={(listId) => {
              const owner = ownerByListId.get(listId)
              return owner !== undefined && owner !== status
            }}
            onAdd={(listId) => addListToStatus(status, listId)}
            onRemove={(listId) => removeListFromStatus(status, listId)}
            primaryHint={t('integrations.trello.mapping.primaryHint')}
            emptyHint={t('integrations.vikunja.mapping.emptyHint')}
            addLabel={t('integrations.vikunja.mapping.addBucket')}
          />
        ))}
      </div>

      {problems.conflicts.length > 0 && (
        <p className="text-sm text-destructive">{t('integrations.vikunja.mapping.conflict')}</p>
      )}

      {problems.deletedOnTerminal && (
        <p className="text-sm text-destructive">
          {t('integrations.vikunja.mapping.deletedOnTerminal')}
        </p>
      )}

      {problems.completedNotTerminal && (
        <div className="grid gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
          <span>{t('integrations.vikunja.mapping.completedNotTerminal')}</span>
          <Label className="gap-2">
            <Switch checked={confirmCompleted} onCheckedChange={setConfirmCompleted} />
            <span>{t('integrations.vikunja.mapping.confirmCompleted')}</span>
          </Label>
        </div>
      )}

      {createdNote && (
        <p className="text-sm text-emerald-500">{t('integrations.vikunja.mapping.created')}</p>
      )}

      {canCreate && (
        <VikunjaMissingColumnsPanel
          columns={missingColumns}
          busy={busy}
          canSkip={flat !== null}
          onCreate={() => void handleCreateColumns()}
          onSkip={() => void handleSkipToFlat()}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          {t('integrations.trello.board.back')}
        </Button>
        <Button type="button" onClick={() => void handleSave()} disabled={blocked || busy}>
          {t('integrations.trello.mapping.save')}
        </Button>
      </div>
    </div>
  )
}
