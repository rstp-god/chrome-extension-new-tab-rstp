import { VIKUNJA_PULL_PERIOD_MIN } from '@/background/vikunja/messages.ts'
import { Button } from '@/components/ui/button.tsx'
import { TodoConfirmDialog } from '@/widgets/Todo/components/settings/TodoConfirmDialog.tsx'
import { TodoImportDialog } from '@/widgets/Todo/components/settings/TodoImportDialog.tsx'
import { getIntegrationDescriptor, TODO_STATUSES } from '@/widgets/Todo/integrations/index.ts'
import { VIKUNJA_LOCAL_ONLY_STATUSES } from '@/widgets/Todo/integrations/vikunja/constants.ts'
import { VikunjaPullPeriodSelect } from '@/widgets/Todo/integrations/vikunja/VikunjaPullPeriodSelect.tsx'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { unlinkedLocalTasks } from '@/widgets/Todo/store/sync.ts'
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

  /**
   * Every label here is the backend's own word for the thing: Trello has a
   * board, Vikunja has a project, and a summary that said "Board" over a
   * Vikunja project would be describing the previous integration.
   */
  const summaryKey = (leaf: string) => `integrations.${integration.name}.summary.${leaf}`

  // Vikunja-specific because the condition is: the user declined the bucket
  // mapping, so four of the five statuses never leave the extension. A
  // generic `descriptor.SummaryNotice` component would be a bigger change
  // for one line of copy — branch here instead, and promote it if a second
  // backend ever grows a caveat.
  //
  // The per-status table is hidden in that mode rather than shown: it would
  // list the same default bucket four times, which describes a placeholder
  // the sync deliberately never writes to.
  const flatMode = integration.name === 'vikunja' && !integration.config.kanbanMapping

  /**
   * Offered only by a backend that does not sweep local tasks along on its
   * own (ADR §Р10). A descriptor that says nothing counts as "does not" —
   * the same default `selectPendingTasks` applies — so the action appears
   * rather than the tasks silently going nowhere.
   */
  const canImport =
    getIntegrationDescriptor(integration.name)?.autoImportLocalTasks !== true &&
    importable.length > 0

  const scopeName = integration.boardName ?? '—'

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
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t(summaryKey('boardLabel'))}</span>
          <span className="font-medium">{integration.boardName ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t(summaryKey('lastSync'))}</span>
          <span className="font-medium">{lastSyncLabel}</span>
        </div>
      </div>

      {integration.name === 'vikunja' && (
        <VikunjaPullPeriodSelect
          value={integration.config.pullPeriodMin ?? VIKUNJA_PULL_PERIOD_MIN}
          disabled={busy || loading}
          onChange={(pullPeriodMin) => {
            // The worker keeps no state: it picks the new period up from
            // `chrome.storage.onChanged` on this very write.
            updateIntegrationConfig({ ...integration.config, pullPeriodMin })
          }}
        />
      )}

      {flatMode && (
        <div className="grid gap-1.5 rounded-2xl border border-border bg-muted/20 px-3 py-2 text-sm">
          <p role="alert" className="text-muted-foreground">
            {t('integrations.vikunja.mapping.flatNotice')}
          </p>
          {/* Named rather than implied: "only Completed syncs" leaves the user
              to work out which statuses that leaves behind. */}
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('integrations.vikunja.summary.localOnlyLabel')}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {VIKUNJA_LOCAL_ONLY_STATUSES.map((status) => (
              <li key={status}>{t(`integrations.mapping.row.${status}`)}</li>
            ))}
          </ul>
        </div>
      )}

      {integration.mapping && !flatMode && (
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

      {errorKey && (
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
            {t('integrations.import.action', { n: importable.length, scope: scopeName })}
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
