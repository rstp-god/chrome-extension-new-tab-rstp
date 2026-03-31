import { Button } from '@/components/ui/button.tsx'
import { TodoTask } from '@/widgets/Todo/store/store.ts'
import clsx from 'clsx'
import { CheckIcon, ExternalLinkIcon, Trash2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

function getHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

interface Props {
  task: TodoTask
  pendingAction?: 'complete' | 'delete'
  onToggleTask: (taskId: string) => void
  onStartTaskExit: (taskId: string, action: 'complete' | 'delete') => void
  onOpenLinkedTab: (taskId: string) => void
}

export function TodoTaskCard({
  task,
  pendingAction,
  onToggleTask,
  onStartTaskExit,
  onOpenLinkedTab,
}: Props) {
  const { t } = useTranslation('todoWidget')
  const isCompleted = task.completed && !task.deleted
  const isDeleted = task.deleted

  return (
    <div
      className={clsx(
        'rounded-[2rem] border border-border bg-black/25 px-5 py-6 transition-all duration-300 ease-out',
        {
          'translate-x-16 border-emerald-500/40 bg-emerald-500/20 opacity-0':
            pendingAction === 'complete',
          '-translate-x-16 border-destructive/40 bg-destructive/20 opacity-0':
            pendingAction === 'delete',
          'border-emerald-500/20 bg-emerald-500/8': isCompleted,
          'border-destructive/20 bg-destructive/8': isDeleted,
        },
      )}
    >
      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="mt-0.5 shrink-0 rounded-full"
          onClick={() => {
            if (isDeleted) return
            if (isCompleted) {
              onToggleTask(task.id)
              return
            }

            onStartTaskExit(task.id, 'complete')
          }}
          aria-label={t('actions.completeTodo')}
          disabled={Boolean(pendingAction) || isDeleted}
        >
          <CheckIcon />
        </Button>

        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold leading-tight">{task.title}</div>
          {task.description && (
            <p className="mt-3 whitespace-pre-wrap text-base text-muted-foreground">
              {task.description}
            </p>
          )}

          {task.linkedTab && (
            <button
              type="button"
              className="mt-5 flex max-w-full items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground"
              onClick={() => onOpenLinkedTab(task.id)}
            >
              <ExternalLinkIcon className="size-4 shrink-0" />
              <span className="truncate">
                {task.linkedTab.title ?? getHostname(task.linkedTab.url)}
              </span>
            </button>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={() => {
            if (isDeleted) return
            onStartTaskExit(task.id, 'delete')
          }}
          aria-label={t('actions.deleteTodo')}
          disabled={Boolean(pendingAction) || isDeleted}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  )
}
