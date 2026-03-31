import { Button } from '@/components/ui/button.tsx'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { AddTodoDialog } from '@/widgets/Todo/AddTodoDialog.tsx'
import { useTodoStore } from '@/widgets/Todo/store.ts'
import { CheckIcon, ExternalLinkIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const TODO_EXIT_ANIMATION_MS = 260

function getHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function TodoWidget() {
  const { t } = useTranslation('todoWidget')
  const [open, setOpen] = useState(false)
  const [pendingActions, setPendingActions] = useState<Record<string, 'complete' | 'delete'>>({})
  const { tasks, addTask, toggleTask, removeTask, openOrFocusLinkedTab } = useTodoStore(
    (state) => state,
  )
  const timeoutRefs = useRef<Record<string, number>>({})

  useEffect(() => {
    return () => {
      Object.values(timeoutRefs.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
    }
  }, [])

  const activeTasks = useMemo(
    () =>
      tasks
        .filter((task) => !task.completed)
        .sort((left, right) => right.createdAt - left.createdAt),
    [tasks],
  )

  const startTaskExit = (taskId: string, action: 'complete' | 'delete') => {
    if (pendingActions[taskId]) return

    setPendingActions((current) => ({
      ...current,
      [taskId]: action,
    }))

    timeoutRefs.current[taskId] = window.setTimeout(() => {
      if (action === 'complete') {
        toggleTask(taskId)
      } else {
        removeTask(taskId)
      }

      setPendingActions((current) => {
        const next = { ...current }
        delete next[taskId]
        return next
      })

      delete timeoutRefs.current[taskId]
    }, TODO_EXIT_ANIMATION_MS)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {activeTasks.length === 0 ? (
        <div className="flex flex-1 items-center">
          <div className="w-full rounded-[2rem] border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-3 pr-2">
            {activeTasks.map((task) => {
              const pendingAction = pendingActions[task.id]

              return (
                <div
                  key={task.id}
                  className={[
                    'rounded-[2rem] border border-border bg-black/25 px-5 py-6 transition-all duration-300 ease-out',
                    pendingAction === 'complete' &&
                      'translate-x-16 border-emerald-500/40 bg-emerald-500/20 opacity-0',
                    pendingAction === 'delete' &&
                      '-translate-x-16 border-destructive/40 bg-destructive/20 opacity-0',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="mt-0.5 shrink-0 rounded-full"
                      onClick={() => startTaskExit(task.id, 'complete')}
                      aria-label={t('actions.completeTodo')}
                      disabled={Boolean(pendingAction)}
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
                          onClick={() => void openOrFocusLinkedTab(task.id)}
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
                      onClick={() => startTaskExit(task.id, 'delete')}
                      aria-label={t('actions.deleteTodo')}
                      disabled={Boolean(pendingAction)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}

      <Button size="lg" className="mt-auto w-full" onClick={() => setOpen(true)}>
        <PlusIcon />
        {t('actions.addTodo')}
      </Button>

      <AddTodoDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={({ title, description, linkedTab }) => addTask({ title, description, linkedTab })}
      />
    </div>
  )
}
