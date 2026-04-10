import type { TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import { STATUS_PILL_CLASS } from '@/widgets/Todo/statusStyles.ts'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

interface Props {
  status: TodoStatus
  className?: string
}

export function StatusPill({ status, className }: Props) {
  const { t } = useTranslation('todoWidget')
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider',
        STATUS_PILL_CLASS[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  )
}
