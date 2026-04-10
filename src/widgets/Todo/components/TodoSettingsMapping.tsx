import { Button } from '@/components/ui/button.tsx'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import {
  TODO_STATUSES,
  type StatusListMapping,
  type TodoStatus,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { STATUS_BORDER_CLASS, STATUS_PILL_CLASS } from '@/widgets/Todo/statusStyles.ts'
import clsx from 'clsx'
import { PlusIcon, StarIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const integration = useTodoStore((state) => state.integration)
  const setMapping = useTodoStore((state) => state.setMapping)
  const errorKey = useTodoStore((state) => state.errorKey)

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

  /** Status that currently owns each listId, so other rows can hide it. */
  const ownerByListId = useMemo(() => {
    const map = new Map<string, TodoStatus>()
    for (const status of TODO_STATUSES) {
      for (const id of draft[status]) {
        map.set(id, status)
      }
    }
    return map
  }, [draft])

  const isValid = TODO_STATUSES.every((status) => draft[status].length > 0)
  const hasExistingTasks = useTodoStore((state) =>
    state.tasks.some((task) => task.remoteRef !== null),
  )
  const hadMappingBefore = integration?.mapping !== null && integration?.mapping !== undefined

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
        {TODO_STATUSES.map((status) => {
          const selected = draft[status]
          return (
            <StatusRow
              key={status}
              status={status}
              statusLabel={t(`integrations.trello.mapping.row.${status}`)}
              selectedListIds={selected}
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
          )
        })}
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

interface StatusRowProps {
  status: TodoStatus
  statusLabel: string
  selectedListIds: string[]
  listNameById: Map<string, string>
  availableLists: { id: string; name: string }[]
  isSelectedInOther: (listId: string) => boolean
  onAdd: (listId: string) => void
  onRemove: (listId: string) => void
  primaryHint: string
  emptyHint: string
  addLabel: string
}

function StatusRow({
  status,
  statusLabel,
  selectedListIds,
  listNameById,
  availableLists,
  isSelectedInOther,
  onAdd,
  onRemove,
  primaryHint,
  emptyHint,
  addLabel,
}: StatusRowProps) {
  const [open, setOpen] = useState(false)
  // Hide lists already owned by another status entirely — surfacing them as
  // disabled rows just confuses users.
  const selectableLists = availableLists.filter(
    (list) => !selectedListIds.includes(list.id) && !isSelectedInOther(list.id),
  )

  return (
    <div
      className={clsx(
        'rounded-2xl border border-border border-l-4 bg-muted/30 px-3 py-2.5',
        STATUS_BORDER_CLASS[status],
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider',
            STATUS_PILL_CLASS[status],
          )}
        >
          {statusLabel}
        </span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={selectableLists.length === 0}>
              <PlusIcon className="size-3.5" />
              <span>{addLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <Command>
              <CommandInput placeholder={addLabel} />
              <CommandList>
                <CommandEmpty>{emptyHint}</CommandEmpty>
                <CommandGroup>
                  {selectableLists.map((list) => (
                    <CommandItem
                      key={list.id}
                      value={list.name}
                      onSelect={() => {
                        onAdd(list.id)
                        setOpen(false)
                      }}
                    >
                      {list.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {selectedListIds.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedListIds.map((listId, index) => (
            <span
              key={listId}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-0.5 text-xs"
            >
              {index === 0 && (
                <StarIcon className="size-3 fill-current text-amber-400" aria-label={primaryHint} />
              )}
              <span>{listNameById.get(listId) ?? listId}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onRemove(listId)}
                aria-label="remove"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
