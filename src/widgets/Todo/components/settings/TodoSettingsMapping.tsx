import { Button } from '@/components/ui/button.tsx'
import { MappingStatusRow } from '@/widgets/Todo/components/settings/MappingStatusRow.tsx'
import {
  TODO_STATUSES,
  type StatusListMapping,
  type TodoStatus,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

interface Props {
  onBack: () => void
}

function makeEmptyMapping(): StatusListMapping {
  return {
    input: [],
    inprogress: [],
    struggle: [],
    completed: [],
    deleted: [],
  }
}

export function TodoSettingsMapping({ onBack }: Props) {
  const { t } = useTranslation('todoWidget')
  const { integration, setMapping, errorKey, hasExistingTasks } = useTodoStore(
    useShallow((state) => ({
      integration: state.integration,
      setMapping: state.setMapping,
      errorKey: state.errorKey,
      hasExistingTasks: state.tasks.some((task) => task.remoteRef !== null),
    })),
  )

  const lists = useMemo(() => integration?.lists ?? [], [integration?.lists])
  const listNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const list of lists) map.set(list.id, list.name)
    return map
  }, [lists])

  const [draft, setDraft] = useState<StatusListMapping>(
    () => integration?.mapping ?? makeEmptyMapping(),
  )
  const [busy, setBusy] = useState(false)

  /**
   * Inverse map of `listId → owning status`. Built once per draft change so
   * each row's "is this list taken?" check stays O(1).
   *
   * The "nested loop" is unavoidable in the sense that we have to visit
   * every (status, listId) pair exactly once to invert the relation. The
   * `flatMap` form makes that intent obvious without changing complexity.
   */
  const ownerByListId = useMemo(
    () =>
      new Map<string, TodoStatus>(
        TODO_STATUSES.flatMap((status) => draft[status].map((id) => [id, status] as const)),
      ),
    [draft],
  )

  const isValid = TODO_STATUSES.every((status) => draft[status].length > 0)
  const hadMappingBefore = integration?.mapping !== null && integration?.mapping !== undefined

  /**
   * Append `listId` to the array for `status`. The dedup guard keeps the
   * draft idempotent if the same list ever ends up in the popover twice
   * (e.g. mid-render race) — we don't want it appearing as two chips.
   */
  const addListToStatus = (status: TodoStatus, listId: string) => {
    setDraft((current) => ({
      ...current,
      [status]: current[status].includes(listId) ? current[status] : [...current[status], listId],
    }))
  }

  /**
   * Drop `listId` from the array for `status`. Order of the remaining ids
   * is preserved so the "primary" (first in array) doesn't silently shift.
   */
  const removeListFromStatus = (status: TodoStatus, listId: string) => {
    setDraft((current) => ({
      ...current,
      [status]: current[status].filter((id) => id !== listId),
    }))
  }

  const handleSave = async () => {
    if (!isValid) return
    setBusy(true)
    await setMapping(draft)
    setBusy(false)
  }

  return (
    <div className="grid gap-4">
      {hasExistingTasks && hadMappingBefore && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
          {t('integrations.trello.mapping.rebindWarning')}
        </p>
      )}

      {errorKey && (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`integrations.trello.errors.${errorKey}`)}
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
            emptyHint={t('integrations.trello.mapping.emptyHint')}
            addLabel={t('integrations.trello.mapping.addList')}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          {t('integrations.trello.board.back')}
        </Button>
        <Button type="button" onClick={handleSave} disabled={!isValid || busy}>
          {t('integrations.trello.mapping.save')}
        </Button>
      </div>
    </div>
  )
}
