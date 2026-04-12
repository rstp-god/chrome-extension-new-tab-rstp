import { Button } from '@/components/ui/button.tsx'
import { ProjectPill } from '@/widgets/Todo/components/widget/ProjectPill.tsx'
import type { Project, TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'
import { STATUS_BORDER_CLASS } from '@/widgets/Todo/statusStyles.ts'
import { getNextStatus, getPrevStatus, isFlowStatus } from '@/widgets/Todo/utils/statusFlow.ts'
import { getHostname } from '@/widgets/Todo/utils/url.ts'
import { testIds } from '@tests/constants/testIds.ts'
import clsx from 'clsx'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  Trash2Icon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  task: TodoTask
  project: Project | null
  pendingAction?: 'complete' | 'delete'
  onToggleTask: (taskId: string) => void
  onStartTaskExit: (taskId: string, action: 'complete' | 'delete') => void
  onOpenLinkedTab: (taskId: string) => void
  onChangeStatus: (taskId: string, status: TodoStatus) => void
}

export function TodoTaskCard({
  task,
  project,
  pendingAction,
  onToggleTask,
  onStartTaskExit,
  onOpenLinkedTab,
  onChangeStatus,
}: Props) {
  const { t } = useTranslation('todoWidget')
  const isCompleted = task.status === 'completed'
  const isDeleted = task.status === 'deleted'
  const isDirty = task.syncState !== 'clean'
  const isInFlow = isFlowStatus(task.status)
  const nextStatus = getNextStatus(task.status)
  const prevStatus = getPrevStatus(task.status)

  // Note on shadcn `<Card>` (asked in review): not used here because the
  // status-color border, dirty dot positioning and the side-swipe exit
  // animation all want a single bare `<div>` we control end-to-end.
  // Wrapping it in `<Card>/<CardContent>` would add layers without removing
  // any of the bespoke styling.
  return (
    <div
      data-testid={testIds.todoTask(task.id)}
      className={clsx(
        'relative rounded-2xl border border-l-4 border-border bg-black/25 px-4 py-4 transition-all duration-300 ease-out',
        STATUS_BORDER_CLASS[task.status],
        {
          'translate-x-16 opacity-0': pendingAction === 'complete',
          '-translate-x-16 opacity-0': pendingAction === 'delete',
          'opacity-70': isDeleted,
        },
      )}
    >
      {isDirty && (
        <span
          className={clsx(
            'absolute right-3 top-3 size-1.5 rounded-full',
            task.syncState === 'error' ? 'bg-destructive' : 'bg-amber-400',
          )}
          title={task.syncState}
          aria-hidden
        />
      )}

      <div className="flex items-start gap-3">
        <Button
          data-testid={testIds.todoComplete(task.id)}
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
          {project && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <ProjectPill project={project} />
            </div>
          )}

          <div
            className={clsx(
              'text-base font-semibold leading-tight',
              (isCompleted || isDeleted) && 'text-muted-foreground line-through decoration-1',
            )}
          >
            {task.title}
          </div>

          {task.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {task.description}
            </p>
          )}

          {task.linkedTab && (
            <button
              data-testid={testIds.todoOpenLinkedTab(task.id)}
              type="button"
              className="mt-3 flex max-w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onOpenLinkedTab(task.id)}
            >
              <ExternalLinkIcon className="size-3.5 shrink-0" />
              <span className="truncate">
                {task.linkedTab.title ?? getHostname(task.linkedTab.url)}
              </span>
            </button>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {task.linkedTab && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenLinkedTab(task.id)}
              aria-label={t('actions.openLinkedTab')}
              disabled={Boolean(pendingAction)}
            >
              <ExternalLinkIcon />
            </Button>
          )}
          <div className="flex items-center gap-0.5">
            {/* Note on the array-of-configs idea (asked in review): each of
                these buttons has a unique testid, condition, and onClick
                semantics — collapsing them into a config-driven map ends up
                with the same number of lines and an extra layer of
                indirection, so they stay inline. */}
            {isInFlow && (
              <>
                <Button
                  data-testid={testIds.todoPrevStatus(task.id)}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => prevStatus && onChangeStatus(task.id, prevStatus)}
                  aria-label={t('actions.moveToPreviousStatus')}
                  disabled={Boolean(pendingAction) || !prevStatus}
                >
                  <ChevronLeftIcon />
                </Button>
                <Button
                  data-testid={testIds.todoNextStatus(task.id)}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => nextStatus && onChangeStatus(task.id, nextStatus)}
                  aria-label={t('actions.moveToNextStatus')}
                  disabled={Boolean(pendingAction) || !nextStatus}
                >
                  <ChevronRightIcon />
                </Button>
              </>
            )}
            <Button
              data-testid={testIds.todoDelete(task.id)}
              type="button"
              variant="ghost"
              size="icon-sm"
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
      </div>
    </div>
  )
}
