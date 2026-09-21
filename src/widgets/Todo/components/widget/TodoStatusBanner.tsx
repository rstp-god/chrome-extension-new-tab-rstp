import { Button } from '@/components/ui/button.tsx'
import { TestId } from '@tests/constants/testIds.ts'
import { KeyRoundIcon, ShieldAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { TerminalErrorKey } from '@/widgets/Todo/utils/errorState.ts'

interface Props {
  /** Only the two failures the user can act on ever reach here. */
  errorKey: TerminalErrorKey
  /** Host of the instance whose grant was withdrawn; `null` when unknown. */
  host: string | null
  /**
   * Whether the active integration can re-request its permission in place
   * (`descriptor.recoverPermission`). When it cannot, the banner states the
   * problem and offers nothing: a "Grant again" button that quietly opened
   * the settings instead would be a lie about what the click does.
   */
  canRecover: boolean
  onOpenSettings: () => void
  onGrantPermission: () => void
}

/**
 * The one thing in the widget that interrupts the task list: a sync that has
 * stopped and will not restart on its own.
 *
 * Both cases are dead ends for the widget itself — a revoked token, a host
 * permission the user withdrew — so each comes with the single action that
 * ends it, rather than with a retry button that would fail the same way. The
 * quieter failures stay in the footer badge (`network`), and a `conflict`
 * belongs to one card and is badged there: a global banner would blame the
 * whole widget for one task.
 */
export function TodoStatusBanner({
  errorKey,
  host,
  canRecover,
  onOpenSettings,
  onGrantPermission,
}: Props) {
  const { t } = useTranslation('todoWidget')

  const authInvalid = errorKey === 'authInvalid'
  const Icon = authInvalid ? KeyRoundIcon : ShieldAlertIcon

  const text = authInvalid
    ? t('banners.authInvalid.text')
    : host
      ? t('banners.permissionMissing.text', { host })
      : t('banners.permissionMissing.textUnknownHost')

  const action = authInvalid
    ? { label: t('banners.authInvalid.action'), onClick: onOpenSettings }
    : canRecover
      ? { label: t('banners.permissionMissing.action'), onClick: onGrantPermission }
      : null

  return (
    <div
      data-testid={TestId.TodoStatusBanner}
      role="alert"
      className="flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{text}</span>
      {action && (
        <Button
          data-testid={TestId.TodoStatusBannerAction}
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
