import { Button } from '@/components/ui/button.tsx'
import { TODO_STATUSES } from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { RefreshCwIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  onEditMapping: () => void
  onPickBoard: () => void
}

function formatRelative(timestamp: number | null, neverLabel: string): string {
  if (timestamp === null) return neverLabel
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function TodoSettingsSummary({ onEditMapping, onPickBoard }: Props) {
  const { t } = useTranslation('todoWidget')
  const integration = useTodoStore((state) => state.integration)
  const loading = useTodoStore((state) => state.loading)
  const errorKey = useTodoStore((state) => state.errorKey)
  const syncNow = useTodoStore((state) => state.syncNow)
  const clearIntegration = useTodoStore((state) => state.clearIntegration)
  const [busy, setBusy] = useState(false)

  const listNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const list of integration?.lists ?? []) map.set(list.id, list.name)
    return map
  }, [integration?.lists])

  if (!integration) return null

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
          <span className="font-medium">
            {formatRelative(integration.lastSyncAt, t('integrations.trello.summary.neverSynced'))}
          </span>
        </div>
      </div>

      {integration.mapping && (
        <div className="grid gap-1.5 rounded-2xl border border-border bg-muted/20 p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('integrations.trello.summary.mappingLabel')}
          </div>
          {TODO_STATUSES.map((status) => (
            <div key={status} className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">
                {t(`integrations.trello.mapping.row.${status}`)}
              </span>
              <span className="text-right">
                {integration.mapping?.[status].map((id) => listNameById.get(id) ?? id).join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {errorKey && (
        <p className="text-sm text-destructive">{t(`integrations.trello.errors.${errorKey}`)}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSync} disabled={busy || loading}>
          <RefreshCwIcon className={loading || busy ? 'animate-spin' : undefined} />
          {t('actions.syncNow')}
        </Button>
        <Button type="button" variant="outline" onClick={onEditMapping}>
          {t('integrations.trello.mapping.title')}
        </Button>
        <Button type="button" variant="outline" onClick={onPickBoard}>
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
