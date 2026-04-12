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
import type { TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import { STATUS_BORDER_CLASS, STATUS_PILL_CLASS } from '@/widgets/Todo/statusStyles.ts'
import clsx from 'clsx'
import { PlusIcon, StarIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

interface RemoteListSummary {
  id: string
  name: string
}

export interface MappingStatusRowProps {
  status: TodoStatus
  statusLabel: string
  selectedListIds: string[]
  listNameById: Map<string, string>
  /** All lists on the connected board (the row filters out unavailable). */
  availableLists: RemoteListSummary[]
  /** Lookup whether a list is currently owned by a different status. Owned
   *  lists are hidden from the popover entirely so the user can't pick a
   *  list that's already mapped elsewhere. */
  isSelectedInOther: (listId: string) => boolean
  onAdd: (listId: string) => void
  onRemove: (listId: string) => void
  primaryHint: string
  emptyHint: string
  addLabel: string
}

/**
 * One row of the list-mapping table. Encapsulates the popover-driven
 * combobox + the chip strip showing the currently-mapped lists for a
 * single status.
 *
 * Re: Popover vs. Combobox (asked in review): shadcn ships its
 * "Combobox" recipe as Popover + Command, which is exactly what we use
 * here. A non-popover variant (always-open inline list, or DropdownMenu
 * with checkbox items) would either eat far more vertical space or lose
 * the searchable input — so the popover stays. If you want a different
 * dropdown style later, switch the trigger here without touching the
 * outer mapping logic.
 */
export function MappingStatusRow({
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
}: MappingStatusRowProps) {
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
