import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import clsx from 'clsx'
import { AlertTriangleIcon, CheckCircle2Icon, RefreshCwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

function formatRelative(timestamp: number, neverLabel: string): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return neverLabel
}

/**
 * Compact footer indicator for the active integration's sync state. Hidden
 * entirely when there's no integration set up — keeps the footer clean for
 * users who don't sync.
 */
export function TodoSyncBadge() {
  const { t } = useTranslation('todoWidget')
  const integration = useTodoStore((state) => state.integration)
  const loading = useTodoStore((state) => state.loading)
  const errorKey = useTodoStore((state) => state.errorKey)

  if (!integration || !integration.mapping) return null

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCwIcon className="size-3 animate-spin" />
        {t('footer.syncing')}
      </span>
    )
  }

  if (errorKey) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-destructive"
        title={t(`integrations.trello.errors.${errorKey}`)}
      >
        <AlertTriangleIcon className="size-3" />
        {t(`integrations.trello.errors.${errorKey}`)}
      </span>
    )
  }

  const lastSync = integration.lastSyncAt
  return (
    <span
      className={clsx('inline-flex items-center gap-1.5 text-xs text-muted-foreground')}
      title={lastSync ? new Date(lastSync).toLocaleString() : undefined}
    >
      <CheckCircle2Icon className="size-3" />
      {lastSync
        ? t('footer.lastSynced', { when: formatRelative(lastSync, t('footer.neverSynced')) })
        : t('footer.neverSynced')}
    </span>
  )
}
