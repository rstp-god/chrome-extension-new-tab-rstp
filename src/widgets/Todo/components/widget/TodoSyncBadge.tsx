import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { formatRelative } from '@/widgets/Todo/utils/formatRelative.ts'
import { AlertTriangleIcon, CheckCircle2Icon, RefreshCwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

type SyncBadgeView = 'syncing' | 'error' | 'idle'

/**
 * Compact footer indicator for the active integration's sync state. Hidden
 * entirely when there's no integration set up — keeps the footer clean for
 * users who don't sync.
 */
export function TodoSyncBadge() {
  const { t, i18n } = useTranslation('todoWidget')
  const { integration, loading, errorKey } = useTodoStore(
    useShallow((state) => ({
      integration: state.integration,
      loading: state.loading,
      errorKey: state.errorKey,
    })),
  )

  if (!integration || !integration.mapping) return null

  // Collapse the three orthogonal flags into a single discriminant so the
  // render path is a flat switch instead of a chain of `if`s.
  const view: SyncBadgeView = loading ? 'syncing' : errorKey ? 'error' : 'idle'

  switch (view) {
    case 'syncing':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCwIcon className="size-3 animate-spin" />
          {t('footer.syncing')}
        </span>
      )

    case 'error':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-destructive"
          title={t(`integrations.trello.errors.${errorKey}`)}
        >
          <AlertTriangleIcon className="size-3" />
          {t(`integrations.trello.errors.${errorKey}`)}
        </span>
      )

    case 'idle': {
      const lastSync = integration.lastSyncAt
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          title={lastSync ? new Date(lastSync).toLocaleString() : undefined}
        >
          <CheckCircle2Icon className="size-3" />
          {lastSync
            ? t('footer.lastSynced', { when: formatRelative(lastSync, i18n.language) })
            : t('footer.neverSynced')}
        </span>
      )
    }
  }
}
