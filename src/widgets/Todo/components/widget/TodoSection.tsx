import type { TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import { STATUS_DOT_CLASS } from '@/widgets/Todo/statusStyles.ts'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  status: TodoStatus
  count: number
  children: ReactNode
}

const HEADER_KEY: Record<TodoStatus, string> = {
  input: 'status.headerInput',
  inprogress: 'status.headerInprogress',
  struggle: 'status.headerStruggle',
  completed: 'status.headerCompleted',
  deleted: 'status.headerDeleted',
}

export function TodoSection({ status, count, children }: Props) {
  const { t } = useTranslation('todoWidget')
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <header className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={clsx('size-1.5 rounded-full', STATUS_DOT_CLASS[status])} />
        <span>{t(HEADER_KEY[status])}</span>
        <span className="opacity-60">({count})</span>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">{children}</div>
    </section>
  )
}
