import { Button } from '@/components/ui/button.tsx'
import { TodoSyncBadge } from '@/widgets/Todo/components/TodoSyncBadge.tsx'
import { TODO_STATUSES, type TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { STATUS_PILL_CLASS } from '@/widgets/Todo/statusStyles.ts'
import { TestId } from '@tests/constants/testIds.ts'
import clsx from 'clsx'
import {
  AlertTriangleIcon,
  CheckIcon,
  type LucideIcon,
  InboxIcon,
  LoaderIcon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  Trash2Icon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  visibleStatuses: ReadonlySet<TodoStatus>
  onToggleStatus: (status: TodoStatus) => void
  onOpenAdd: () => void
  onOpenSettings: () => void
}

const STATUS_ICON: Record<TodoStatus, LucideIcon> = {
  input: InboxIcon,
  inprogress: LoaderIcon,
  struggle: AlertTriangleIcon,
  completed: CheckIcon,
  deleted: Trash2Icon,
}

const STATUS_TEST_ID: Record<TodoStatus, TestId> = {
  input: TestId.TodoFilterInput,
  inprogress: TestId.TodoFilterInprogress,
  struggle: TestId.TodoFilterStruggle,
  completed: TestId.TodoFilterCompleted,
  deleted: TestId.TodoFilterDeleted,
}

const STATUS_LABEL_KEY: Record<TodoStatus, string> = {
  input: 'actions.filterInput',
  inprogress: 'actions.filterInprogress',
  struggle: 'actions.filterStruggle',
  completed: 'actions.filterCompleted',
  deleted: 'actions.filterDeleted',
}

export function TodoFooter({ visibleStatuses, onToggleStatus, onOpenAdd, onOpenSettings }: Props) {
  const { t } = useTranslation('todoWidget')
  const integration = useTodoStore((state) => state.integration)
  const loading = useTodoStore((state) => state.loading)
  const syncNow = useTodoStore((state) => state.syncNow)

  const canSync = Boolean(integration?.mapping)

  return (
    <div className="mt-auto grid gap-2">
      {canSync && (
        <div className="flex items-center justify-between gap-2 px-1">
          <TodoSyncBadge />
          <Button
            data-testid={TestId.TodoSyncNow}
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void syncNow()}
            disabled={loading}
            aria-label={t('actions.syncNow')}
          >
            <RefreshCwIcon className={loading ? 'animate-spin' : undefined} />
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {TODO_STATUSES.map((status) => {
          const Icon = STATUS_ICON[status]
          const active = visibleStatuses.has(status)
          return (
            <Button
              key={status}
              data-testid={STATUS_TEST_ID[status]}
              type="button"
              variant="ghost"
              size="icon-sm"
              className={clsx(
                'shrink-0 rounded-full',
                active ? STATUS_PILL_CLASS[status] : 'text-muted-foreground',
              )}
              onClick={() => onToggleStatus(status)}
              aria-label={t(STATUS_LABEL_KEY[status])}
              aria-pressed={active}
            >
              <Icon />
            </Button>
          )
        })}
        <Button
          data-testid={TestId.TodoOpenAdd}
          size="lg"
          className="ml-1 flex-1"
          onClick={onOpenAdd}
        >
          <PlusIcon />
          {t('actions.addTodo')}
        </Button>
        <Button
          data-testid={TestId.TodoOpenSettings}
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenSettings}
          aria-label={t('actions.openSettings')}
        >
          <Settings2Icon />
        </Button>
      </div>
    </div>
  )
}
