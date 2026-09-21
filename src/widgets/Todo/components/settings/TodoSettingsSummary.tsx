import { Button } from '@/components/ui/button.tsx'
import { TodoConfirmDialog } from '@/widgets/Todo/components/settings/TodoConfirmDialog.tsx'
import { TodoImportDialog } from '@/widgets/Todo/components/settings/TodoImportDialog.tsx'
import {
  getIntegrationDescriptor,
  getProjectPolicy,
  TODO_STATUSES,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { unlinkedLocalTasks } from '@/widgets/Todo/store/sync.ts'
import { isTerminalError } from '@/widgets/Todo/utils/errorState.ts'
import { formatRelative } from '@/widgets/Todo/utils/formatRelative.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { DownloadIcon, RefreshCwIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

interface Props {
  onEditMapping: () => void
  onPickScope: () => void
}

/**
 * Which confirmation is on screen. The two actions do the same thing to the
 * store (see `switchIntegration`) and differ only in what they say, so the
 * dialog is one component parameterised by this.
 */
type PendingConfirm = 'disconnect' | 'switch'

export function TodoSettingsSummary({ onEditMapping, onPickScope }: Props) {
  const { t, i18n } = useTranslation('todoWidget')
  const {
    integration,
    tasks,
    loading,
    errorKey,
    syncNow,
    switchIntegration,
    updateIntegrationConfig,
    importLocalTasks,
  } = useTodoStore(
    useShallow((state) => ({
      integration: state.integration,
      tasks: state.tasks,
      loading: state.loading,
      errorKey: state.errorKey,
      syncNow: state.syncNow,
      switchIntegration: state.switchIntegration,
      updateIntegrationConfig: state.updateIntegrationConfig,
      importLocalTasks: state.importLocalTasks,
    })),
  )
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const listNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const list of integration?.lists ?? []) map.set(list.id, list.name)
    return map
  }, [integration?.lists])

  /** Tasks that predate the integration and were never pushed to it. */
  const importable = useMemo(() => unlinkedLocalTasks(tasks), [tasks])

  if (!integration) return null

  const descriptor = getIntegrationDescriptor(integration.name)

  /**
   * Every label here is the backend's own word for the thing: Trello has a
   * board, Vikunja has a project, and a summary that said "Board" over a
   * Vikunja project would be describing the previous integration.
   */
  const summaryKey = (leaf: string) => `integrations.${integration.name}.summary.${leaf}`

  /**
   * Whether the per-status table describes anything.
   *
   * Two ways it does not. A backend may say no outright (Vikunja in flat
   * mode, where the mapping is a placeholder) and then its `SummaryExtras`
   * explains what happens instead. Or the slice may simply not be where its
   * mapping lives — a backend with several boards has one per board, so there
   * is nothing generic to tabulate and its own section shows them.
   */
  const showsMapping =
    (descriptor?.showsStatusMapping?.(integration.config) ?? true) && integration.mapping !== null
  const SummaryExtras = descriptor?.SummaryExtras

  /**
   * Offered only by a backend that does not sweep local tasks along on its
   * own (ADR §Р10). A descriptor that says nothing counts as "does not" —
   * the same default `selectPendingTasks` applies — so the action appears
   * rather than the tasks silently going nowhere.
   */
  const canImport = descriptor?.autoImportLocalTasks !== true && importable.length > 0

  /**
   * A terminal failure is already stated — once — by the widget's banner,
   * which also carries the action that ends it. Repeating the same sentence
   * here would make one problem look like two.
   */
  const showsError = errorKey !== null && !isTerminalError(errorKey)

  /**
   * The destination an import would create tasks in, in the user's own words
   * — the one thing the import button and its dialog have to name.
   *
   * Three answers, most specific first. A backend that keeps one scope on the
   * slice has its cached name there (Trello). One whose scopes *are* its
   * projects answers with the project a new task goes to — the same id the
   * add dialog preselects — as long as its project cache has been read since
   * the boards became the projects. Failing both, the instance the connection
   * points at, which is still a place the user recognises; `—` is left for a
   * backend that names nothing at all.
   */
  const defaultProjectId = getProjectPolicy(descriptor).defaultId(integration.config)
  const scopeName =
    integration.boardName ??
    integration.projects.find((project) => project.id === defaultProjectId)?.name ??
    descriptor?.describeHost?.(integration.config) ??
    '—'

  const handleSync = async () => {
    setBusy(true)
    await syncNow()
    setBusy(false)
  }

  const handleConfirmed = () => {
    // Closed first, and nothing awaited here: dropping the integration
    // unmounts this component (the dialog computes its step from the store),
    // so there is nobody left to set state afterwards.
    setConfirm(null)
    void switchIntegration()
  }

  const handleImport = (ids: string[]) => {
    setImportOpen(false)
    setBusy(true)
    void importLocalTasks(ids).finally(() => setBusy(false))
  }

  const lastSyncLabel = integration.lastSyncAt
    ? formatRelative(integration.lastSyncAt, i18n.language)
    : t(summaryKey('neverSynced'))

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 text-sm">
        {/* Only for a backend that keeps one scope on the slice. One that
            syncs a list of boards has no single name to put here, and names
            them in its own section below. */}
        {integration.boardName !== null && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t(summaryKey('boardLabel'))}</span>
            <span className="font-medium">{integration.boardName}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t(summaryKey('lastSync'))}</span>
          <span className="font-medium">{lastSyncLabel}</span>
        </div>
      </div>

      {SummaryExtras && (
        <SummaryExtras integration={integration} actions={{ updateIntegrationConfig }} />
      )}

      {showsMapping && (
        <div className="grid gap-1.5 rounded-2xl border border-border bg-muted/20 p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t(summaryKey('mappingLabel'))}
          </div>
          {TODO_STATUSES.map((status) => (
            <div key={status} className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">
                {t(`integrations.mapping.row.${status}`)}
              </span>
              <span className="text-right">
                {integration.mapping?.[status].map((id) => listNameById.get(id) ?? id).join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {showsError && (
        <p className="text-sm text-destructive">{t(`integrations.errors.${errorKey}`)}</p>
      )}

      {canImport && (
        <div>
          <Button
            data-testid={TestId.TodoImportAction}
            type="button"
            variant="outline"
            disabled={busy || loading}
            onClick={() => setImportOpen(true)}
          >
            <DownloadIcon />
            {/* `count` rather than a plain number: "1 task" and "2 tasks"
                decline differently, and in Russian so do 2 and 5. */}
            {t('integrations.import.action', { count: importable.length, scope: scopeName })}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSync} disabled={busy || loading}>
          <RefreshCwIcon className={loading || busy ? 'animate-spin' : undefined} />
          {t('actions.syncNow')}
        </Button>
        <Button type="button" variant="outline" onClick={onEditMapping}>
          {t(`integrations.${integration.name}.mapping.title`)}
        </Button>
        <Button type="button" variant="outline" onClick={onPickScope}>
          {t(summaryKey('rePickBoard'))}
        </Button>
        <Button
          data-testid={TestId.TodoSummarySwitch}
          type="button"
          variant="ghost"
          className="ml-auto"
          onClick={() => setConfirm('switch')}
        >
          {t(summaryKey('switch'))}
        </Button>
        <Button
          data-testid={TestId.TodoSummaryDisconnect}
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirm('disconnect')}
        >
          {t(summaryKey('disconnect'))}
        </Button>
      </div>

      <TodoConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={t(summaryKey(confirm === 'switch' ? 'switch' : 'disconnect'))}
        description={t(summaryKey(confirm === 'switch' ? 'switchConfirm' : 'disconnectConfirm'))}
        confirmLabel={t(summaryKey(confirm === 'switch' ? 'switch' : 'disconnect'))}
        destructive={confirm === 'disconnect'}
        onConfirm={handleConfirmed}
      />

      <TodoImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        tasks={importable}
        scopeName={scopeName}
        onConfirm={handleImport}
      />
    </div>
  )
}
