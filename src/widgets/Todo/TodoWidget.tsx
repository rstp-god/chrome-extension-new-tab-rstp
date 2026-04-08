import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { AddTodoDialog } from '@/widgets/Todo/components/AddTodoDialog.tsx'
import { TodoFooter } from '@/widgets/Todo/components/TodoFooter.tsx'
import { TodoSettingsDialog } from '@/widgets/Todo/components/TodoSettingsDialog.tsx'
import { TodoTaskCard } from '@/widgets/Todo/components/TodoTaskCard.tsx'
import { TodoTask, useTodoStore } from '@/widgets/Todo/store/store.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const TODO_EXIT_ANIMATION_MS = 260

interface PendingActionsState {
  [taskId: string]: 'complete' | 'delete'
}

function shouldIncludeTask(task: TodoTask, showCompleted: boolean, showDeleted: boolean) {
  if (showDeleted) {
    return task.deleted
  }

  if (showCompleted) {
    return task.completed && !task.deleted
  }

  if (task.deleted) {
    return false
  }

  return !task.completed;
}

function getTaskSortTimestamp(task: TodoTask) {
  if (task.deletedAt) return task.deletedAt
  if (task.completedAt) return task.completedAt
  return task.createdAt
}

export function TodoWidget() {
  const { t } = useTranslation('todoWidget')
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [pendingActions, setPendingActions] = useState<PendingActionsState>({})
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

  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((task) => shouldIncludeTask(task, showCompleted, showDeleted))
        .sort((left, right) => getTaskSortTimestamp(right) - getTaskSortTimestamp(left)),
    [showCompleted, showDeleted, tasks],
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
      {visibleTasks.length === 0 ? (
        <div className="flex flex-1 items-center">
          <div className="w-full rounded-[2rem] h-full border border-dashed border-border px-5 py-8 text-center content-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-3 pr-2">
            {visibleTasks.map((task) => (
              <TodoTaskCard
                key={task.id}
                task={task}
                pendingAction={pendingActions[task.id]}
                onToggleTask={toggleTask}
                onStartTaskExit={startTaskExit}
                onOpenLinkedTab={(taskId) => void openOrFocusLinkedTab(taskId)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <TodoFooter
        showCompleted={showCompleted}
        showDeleted={showDeleted}
        onToggleCompleted={() => {
          setShowCompleted((current) => {
            const next = !current
            if (next) setShowDeleted(false)
            return next
          })
        }}
        onToggleDeleted={() => {
          setShowDeleted((current) => {
            const next = !current
            if (next) setShowCompleted(false)
            return next
          })
        }}
        onOpenAdd={() => setOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <AddTodoDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={({ title, description, linkedTab }) => addTask({ title, description, linkedTab })}
      />

      <TodoSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
