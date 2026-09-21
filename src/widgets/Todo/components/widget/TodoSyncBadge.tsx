import { isIntegrationReady, useTodoStore } from '@/widgets/Todo/store/store.ts'
import { isQuietError, isTerminalError } from '@/widgets/Todo/utils/errorState.ts'
import { formatRelative } from '@/widgets/Todo/utils/formatRelative.ts'
import { AlertTriangleIcon, CheckCircle2Icon, RefreshCwIcon, WifiOffIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

type SyncBadgeView = 'syncing' | 'error' | 'quiet' | 'idle'

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

  // Hidden until a sync could actually happen — the same question the footer
  // asks before it shows this row at all.
  if (!integration || !isIntegrationReady(integration)) return null

  /**
   * Collapse the three orthogonal flags into a single discriminant so the
   * render path is a flat switch instead of a chain of `if`s.
   *
   * A terminal failure is checked *before* `loading` and reads as `idle`:
   * the widget's banner is already showing that sentence, with the action
   * that ends it, right above this footer — saying it twice makes one
   * problem look like two. And a spinner would be worse than a repetition,
   * because the widget deliberately stops syncing in that state (see
   * `useOnlineFlush` and the mount guard), so nothing is coming.
   *
   * `network` / `rateLimited` are demoted to `quiet`: they pass on their own
   * and there is nothing for the user to do about either.
   */
  const view: SyncBadgeView = isTerminalError(errorKey)
    ? 'idle'
    : loading
      ? 'syncing'
      : errorKey
        ? isQuietError(errorKey)
          ? 'quiet'
          : 'error'
        : 'idle'

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
          title={t(`integrations.errors.${errorKey}`)}
        >
          <AlertTriangleIcon className="size-3" />
          {t(`integrations.errors.${errorKey}`)}
        </span>
      )

    case 'quiet':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          title={t(`integrations.errors.${errorKey}`)}
        >
          <WifiOffIcon className="size-3" />
          {t(`integrations.errors.${errorKey}`)}
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
