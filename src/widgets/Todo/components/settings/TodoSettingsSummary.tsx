import { Button } from '@/components/ui/button.tsx'
import { TODO_STATUSES } from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { formatRelative } from '@/widgets/Todo/utils/formatRelative.ts'
import { RefreshCwIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

interface Props {
  onEditMapping: () => void
  onPickScope: () => void
}

export function TodoSettingsSummary({ onEditMapping, onPickScope }: Props) {
  const { t, i18n } = useTranslation('todoWidget')
  const { integration, loading, errorKey, syncNow, clearIntegration } = useTodoStore(
    useShallow((state) => ({
      integration: state.integration,
      loading: state.loading,
      errorKey: state.errorKey,
      syncNow: state.syncNow,
      clearIntegration: state.clearIntegration,
    })),
  )
  const [busy, setBusy] = useState(false)

  const listNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const list of integration?.lists ?? []) map.set(list.id, list.name)
    return map
  }, [integration?.lists])

  if (!integration) return null

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

  const handleSync = async () => {
    setBusy(true)
    await syncNow()
    setBusy(false)
  }

  const handleDisconnect = () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(t('integrations.trello.summary.disconnectConfirm'))
      if (!ok) return
    }
    clearIntegration()
  }

  const lastSyncLabel = integration.lastSyncAt
    ? formatRelative(integration.lastSyncAt, i18n.language)
    : t('integrations.trello.summary.neverSynced')

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            {t('integrations.trello.summary.boardLabel')}
          </span>
          <span className="font-medium">{integration.boardName ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('integrations.trello.summary.lastSync')}</span>
          <span className="font-medium">{lastSyncLabel}</span>
        </div>
      </div>

      {flatMode && (
        <p
          role="alert"
          className="rounded-2xl border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
        >
          {t('integrations.vikunja.mapping.flatNotice')}
        </p>
      )}

      {integration.mapping && !flatMode && (
        <div className="grid gap-1.5 rounded-2xl border border-border bg-muted/20 p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('integrations.trello.summary.mappingLabel')}
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSync} disabled={busy || loading}>
          <RefreshCwIcon className={loading || busy ? 'animate-spin' : undefined} />
          {t('actions.syncNow')}
        </Button>
        <Button type="button" variant="outline" onClick={onEditMapping}>
          {t('integrations.trello.mapping.title')}
        </Button>
        <Button type="button" variant="outline" onClick={onPickScope}>
          {t('integrations.trello.summary.rePickBoard')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="ml-auto text-destructive hover:text-destructive"
          onClick={handleDisconnect}
        >
          {t('integrations.trello.summary.disconnect')}
        </Button>
      </div>
    </div>
  )
}
