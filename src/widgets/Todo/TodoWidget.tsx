import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { AddTodoDialog } from '@/widgets/Todo/components/widget/AddTodoDialog.tsx'
import { TodoFooter } from '@/widgets/Todo/components/widget/TodoFooter.tsx'
import { TodoSection } from '@/widgets/Todo/components/widget/TodoSection.tsx'
import { TodoStatusBanner } from '@/widgets/Todo/components/widget/TodoStatusBanner.tsx'
import { TodoTaskCard } from '@/widgets/Todo/components/widget/TodoTaskCard.tsx'
import { TodoSettingsDialog } from '@/widgets/Todo/components/settings/TodoSettingsDialog.tsx'
import { useOnlineFlush } from '@/widgets/Todo/hooks/useOnlineFlush.ts'
import {
  getIntegrationDescriptor,
  getProjectPolicy,
  type Project,
  type TodoStatus,
} from '@/widgets/Todo/integrations/index.ts'
import { isIntegrationReady, useTodoStore } from '@/widgets/Todo/store/store.ts'
import { isTerminalError } from '@/widgets/Todo/utils/errorState.ts'
import {
  groupTasksBySection,
  resolveVisibleStatuses,
  toggleVisibleStatus,
} from '@/widgets/Todo/utils/filter.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const TODO_EXIT_ANIMATION_MS = 260

interface PendingActionsState {
  [taskId: string]: 'complete' | 'delete'
}

export function TodoWidget() {
  const { t } = useTranslation('todoWidget')
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Filter state is the *explicit* user choice; an empty set means "I haven't
  // touched the filters" and falls back to `DEFAULT_VISIBLE_STATUSES` via
  // `effectiveVisibleStatuses` below. That keeps the widget from rendering an
  // empty list when the user toggles all filters off.
  const [visibleStatuses, setVisibleStatuses] = useState<ReadonlySet<TodoStatus>>(
    () => new Set<TodoStatus>(),
  )
  const [pendingActions, setPendingActions] = useState<PendingActionsState>({})

  const tasks = useTodoStore((state) => state.tasks)
  const integration = useTodoStore((state) => state.integration)
  const conflictTaskIds = useTodoStore((state) => state.conflictTaskIds)
  /**
   * Is the connection configured far enough for a sync to mean anything? The
   * descriptor's answer (see `isIntegrationReady`), and the one gate on every
   * sync this component starts — mount, broadcast, back online.
   *
   * A boolean, so the effects below have a stable dependency: the slice
   * itself is replaced on every `lastSyncAt`.
   */
  const ready = isIntegrationReady(integration)
  const integrationName = integration?.name ?? null
  /**
   * The config, for the subscription effect's dependencies: it is what the
   * set of watched boards follows from, and it is replaced wholesale on every
   * change (connect, scope pick, mapping) while surviving the `lastSyncAt`
   * writes a sync makes.
   */
  const integrationConfig = integration?.config ?? null
  const addTask = useTodoStore((state) => state.addTask)
  const toggleTask = useTodoStore((state) => state.toggleTask)
  const removeTask = useTodoStore((state) => state.removeTask)
  const setStatus = useTodoStore((state) => state.setStatus)
  const openOrFocusLinkedTab = useTodoStore((state) => state.openOrFocusLinkedTab)
  const syncNow = useTodoStore((state) => state.syncNow)
  const reportRemoteFailure = useTodoStore((state) => state.reportRemoteFailure)
  const clearError = useTodoStore((state) => state.clearError)
  const errorKey = useTodoStore((state) => state.errorKey)

  const timeoutRefs = useRef<Record<string, number>>({})
  const didMountSync = useRef(false)

  /**
   * A failure that no further sync can clear. Two things follow from it: the
   * widget stops syncing on its own (mount, broadcast, back-online — all of
   * them would fail the same way and re-raise the same error), and the banner
   * below offers the one action that ends it.
   */
  const terminalError = isTerminalError(errorKey)
  /** The banner belongs to an integration; without one there is nothing to fix. */
  const bannerErrorKey = integration !== null && isTerminalError(errorKey) ? errorKey : null
  /**
   * Whose grant went missing, for the permission wording — the descriptor's
   * answer, because only it knows whether its config holds an address the
   * user chose. A backend that names nothing gets the generic sentence.
   */
  const descriptor = getIntegrationDescriptor(integrationName)
  const bannerHost = integration ? (descriptor?.describeHost?.(integration.config) ?? null) : null
  const canRecoverPermission = Boolean(descriptor?.recoverPermission)

  /**
   * What this backend expects of a task's project, for the add dialog: a
   * Vikunja task always has one (its board), a Trello card may have none.
   * The dialog stays prop-driven, so the id is resolved here — it is the one
   * place that has the config.
   */
  const projectPolicy = useMemo(() => getProjectPolicy(descriptor), [descriptor])
  const defaultProjectId = integration ? projectPolicy.defaultId(integration.config) : null

  // Same reason as `projectById`: a Set built once per change beats an
  // `includes` per card, and the store hands out a stable array until a
  // conflict actually appears or clears.
  const conflictIds = useMemo(() => new Set(conflictTaskIds), [conflictTaskIds])

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
  // intentionally watch `ready` so that finishing the wizard while the widget
  // is already mounted also kicks off a sync.
  useEffect(() => {
    if (didMountSync.current) return
    if (!ready) return
    // A mount that lands on a revoked token or a withdrawn host permission
    // must not sync: it would fail, re-raise the very error the banner is
    // already showing, and spin the badge on the way.
    //
    // Read from the store rather than from the render's `terminalError`, and
    // deliberately NOT a dependency: as a dep, the error clearing would
    // re-run this effect and start a *second* initial read next to whatever
    // cleared it (the banner's grant action syncs on its own). The store's
    // single-flight would now join them, but "one effect, one reason to run"
    // is the cheaper guarantee.
    if (isTerminalError(useTodoStore.getState().errorKey)) return
    didMountSync.current = true
    // Forced on purpose: a widget that has just appeared knows nothing, so
    // the worker's snapshot is not good enough — read the backend.
    void syncNow()
  }, [ready, syncNow])

  /**
   * The permission banner's action, and the reason it is not `async`: Chrome
   * grants an optional origin only from inside a user gesture, so the
   * descriptor's hook has to be *called* here — synchronously, before
   * anything is awaited — and everything else hangs off the promise it
   * returns. See `IntegrationDescriptor.recoverPermission`.
   */
  const handleGrantPermission = () => {
    const active = useTodoStore.getState().integration
    if (!active) return
    const descriptor = getIntegrationDescriptor(active.name)
    if (!descriptor?.recoverPermission) return

    void descriptor.recoverPermission(active.config).then((granted) => {
      if (!granted) return
      // This *is* the widget's initial read when the mount effect was the one
      // the error turned away, so mark it as made.
      didMountSync.current = true
      clearError()
      void syncNow()
    })
  }

  // Back online → send what piled up, quietly. Only while a sync could
  // actually succeed.
  useOnlineFlush(ready && !terminalError, syncNow)

  /**
   * Live updates, for a backend that can tell us it moved.
   *
   * Only Vikunja offers `subscribeRemoteChanges` today (its service worker
   * pulls on a `chrome.alarms` schedule and broadcasts the delta); a
   * descriptor without it simply never subscribes, and the widget keeps the
   * mount-and-manual behaviour it always had.
   *
   * A `changed` event is answered by a **silent** sync: no spinner, and the
   * pull is not forced, so the worker serves it from the very snapshot the
   * broadcast was about — one read of someone's instance however many tabs
   * are open. A `failed` event only sets the error key; the alarm ran while
   * nobody was looking, and there is nothing to spin for.
   */
  useEffect(() => {
    if (!integrationName || !integrationConfig || !ready) return

    const descriptor = getIntegrationDescriptor(integrationName)
    if (!descriptor?.subscribeRemoteChanges) return

    // Read from the store rather than closed over: what this effect depends
    // on is the config, and the slice around it is replaced by every sync.
    const current = useTodoStore.getState().integration
    if (!current) return

    // Called as a method, not through a detached reference: an implementation
    // is free to be a real method on the descriptor and read `this`.
    return descriptor.subscribeRemoteChanges(current, (event) => {
      if (event.kind === 'changed') {
        // Read at event time rather than closed over, so a terminal error
        // silences the syncs without re-subscribing the listener every time
        // the error key moves.
        if (isTerminalError(useTodoStore.getState().errorKey)) return
        void syncNow({ silent: true })
        return
      }
      reportRemoteFailure(event.errorKey)
    })
  }, [integrationName, integrationConfig, ready, syncNow, reportRemoteFailure])

  const effectiveVisibleStatuses = useMemo(
    () => resolveVisibleStatuses(visibleStatuses),
    [visibleStatuses],
  )

  const sections = useMemo(
    () => groupTasksBySection(tasks, effectiveVisibleStatuses),
    [tasks, effectiveVisibleStatuses],
  )

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
    setVisibleStatuses((current) => toggleVisibleStatus(current, status))
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {bannerErrorKey && (
        <TodoStatusBanner
          errorKey={bannerErrorKey}
          host={bannerHost}
          canRecover={canRecoverPermission}
          onOpenSettings={() => setSettingsOpen(true)}
          onGrantPermission={handleGrantPermission}
        />
      )}

      {totalVisible === 0 ? (
        <div className="flex flex-1 items-center">
          <div className="w-full rounded-[2rem] h-full border border-dashed border-border px-5 py-8 text-center content-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pr-2">
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
                      hasConflict={conflictIds.has(task.id)}
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
        visibleStatuses={effectiveVisibleStatuses}
        onToggleStatus={handleToggleStatus}
        onOpenAdd={() => setOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <AddTodoDialog
        open={open}
        onOpenChange={setOpen}
        projects={integration?.projects ?? []}
        projectPolicy={projectPolicy}
        defaultProjectId={defaultProjectId}
        onSubmit={({ title, description, linkedTab, projectId }) =>
          addTask({ title, description, linkedTab, projectId })
        }
      />

      <TodoSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
