import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { AddTodoDialog } from '@/widgets/Todo/components/AddTodoDialog.tsx'
import { TodoFooter } from '@/widgets/Todo/components/TodoFooter.tsx'
import { TodoSection } from '@/widgets/Todo/components/TodoSection.tsx'
import { TodoSettingsDialog } from '@/widgets/Todo/components/TodoSettingsDialog.tsx'
import { TodoTaskCard } from '@/widgets/Todo/components/TodoTaskCard.tsx'
import { TODO_STATUSES, type Project, type TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore, type TodoTask } from '@/widgets/Todo/store/store.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const TODO_EXIT_ANIMATION_MS = 260

interface PendingActionsState {
  [taskId: string]: 'complete' | 'delete'
}

const DEFAULT_VISIBLE_STATUSES: ReadonlySet<TodoStatus> = new Set<TodoStatus>([
  'input',
  'inprogress',
  'struggle',
])

function getTaskSortTimestamp(task: TodoTask) {
  if (task.statusChangedAt) return task.statusChangedAt
  if (task.deletedAt) return task.deletedAt
  if (task.completedAt) return task.completedAt
  return task.createdAt
}

export function TodoWidget() {
  const { t } = useTranslation('todoWidget')
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [visibleStatuses, setVisibleStatuses] = useState<ReadonlySet<TodoStatus>>(
    () => new Set(DEFAULT_VISIBLE_STATUSES),
  )
  const [pendingActions, setPendingActions] = useState<PendingActionsState>({})

  const tasks = useTodoStore((state) => state.tasks)
  const integration = useTodoStore((state) => state.integration)
  const addTask = useTodoStore((state) => state.addTask)
  const toggleTask = useTodoStore((state) => state.toggleTask)
  const removeTask = useTodoStore((state) => state.removeTask)
  const setStatus = useTodoStore((state) => state.setStatus)
  const openOrFocusLinkedTab = useTodoStore((state) => state.openOrFocusLinkedTab)
  const syncNow = useTodoStore((state) => state.syncNow)

  const timeoutRefs = useRef<Record<string, number>>({})
  const didMountSync = useRef(false)

  // Project lookup for fast pill rendering inside cards.
  const projectById = useMemo(() => {
    const map = new Map<string, Project>()
    for (const project of integration?.projects ?? []) {
      map.set(project.id, project)
    }
    return map
  }, [integration?.projects])

  useEffect(() => {
    return () => {
      Object.values(timeoutRefs.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
    }
  }, [])

  // Mount-time pull. Guarded against React StrictMode double-invoke. We
  // intentionally watch the integration / mapping presence so that wiring up
  // an integration after the widget is already mounted also kicks off a sync.
  useEffect(() => {
    if (didMountSync.current) return
    if (!integration?.config.boardId || !integration.mapping) return
    didMountSync.current = true
    void syncNow()
  }, [integration?.config.boardId, integration?.mapping, syncNow])

  const sections = useMemo(() => {
    const grouped = new Map<TodoStatus, TodoTask[]>()
    for (const status of TODO_STATUSES) grouped.set(status, [])
    for (const task of tasks) {
      grouped.get(task.status)?.push(task)
    }
    for (const status of TODO_STATUSES) {
      grouped
        .get(status)
        ?.sort((left, right) => getTaskSortTimestamp(right) - getTaskSortTimestamp(left))
    }
    return TODO_STATUSES.filter((status) => visibleStatuses.has(status)).map((status) => ({
      status,
      tasks: grouped.get(status) ?? [],
    }))
  }, [tasks, visibleStatuses])

  const totalVisible = sections.reduce((acc, section) => acc + section.tasks.length, 0)

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

  const handleToggleStatus = (status: TodoStatus) => {
    setVisibleStatuses((current) => {
      const next = new Set(current)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {totalVisible === 0 ? (
        <div className="flex flex-1 items-center">
          <div className="w-full rounded-[2rem] h-full border border-dashed border-border px-5 py-8 text-center content-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-4 pr-2">
            {sections.map((section) =>
              section.tasks.length === 0 ? null : (
                <TodoSection
                  key={section.status}
                  status={section.status}
                  count={section.tasks.length}
                >
                  {section.tasks.map((task) => (
                    <TodoTaskCard
                      key={task.id}
                      task={task}
                      project={task.projectId ? (projectById.get(task.projectId) ?? null) : null}
                      pendingAction={pendingActions[task.id]}
                      onToggleTask={toggleTask}
                      onStartTaskExit={startTaskExit}
                      onOpenLinkedTab={(taskId) => void openOrFocusLinkedTab(taskId)}
                      onChangeStatus={setStatus}
                    />
                  ))}
                </TodoSection>
              ),
            )}
          </div>
        </ScrollArea>
      )}

      <TodoFooter
        visibleStatuses={visibleStatuses}
        onToggleStatus={handleToggleStatus}
        onOpenAdd={() => setOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <AddTodoDialog
        open={open}
        onOpenChange={setOpen}
        projects={integration?.projects ?? []}
        onSubmit={({ title, description, linkedTab, projectId }) =>
          addTask({ title, description, linkedTab, projectId })
        }
      />

      <TodoSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
