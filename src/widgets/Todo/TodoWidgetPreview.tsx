import { Button } from '@/components/ui/button.tsx'
import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx'
import { STATUS_ICON } from '@/widgets/Todo/constants.ts'
import { TODO_STATUSES, type TodoStatus } from '@/widgets/Todo/integrations/index.ts'
import {
  STATUS_BORDER_CLASS,
  STATUS_DOT_CLASS,
  STATUS_PILL_CLASS,
} from '@/widgets/Todo/statusStyles.ts'
import clsx from 'clsx'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Static preview of the Todo widget shown in the "Add widget" picker. The
 * shape mirrors the real widget — sectioned layout with status headers,
 * status-flow chevrons on cards, the 5-button status filter strip in the
 * footer — but every element is `disabled` and reads from a tiny mock
 * dataset. Lives next to the real widget so visual drift surfaces in
 * review.
 */

interface PreviewTask {
  id: string
  status: TodoStatus
  titleKey: string
  descriptionKey: string
}

const PREVIEW_TASKS: readonly PreviewTask[] = [
  {
    id: 'inbox',
    status: 'input',
    titleKey: 'preview.tasks.inbox.title',
    descriptionKey: 'preview.tasks.inbox.description',
  },
  {
    id: 'doing',
    status: 'inprogress',
    titleKey: 'preview.tasks.doing.title',
    descriptionKey: 'preview.tasks.doing.description',
  },
]

const PREVIEW_VISIBLE: readonly TodoStatus[] = ['input', 'inprogress', 'struggle']

const SECTION_HEADER_KEY: Record<TodoStatus, string> = {
  input: 'status.headerInput',
  inprogress: 'status.headerInprogress',
  struggle: 'status.headerStruggle',
  completed: 'status.headerCompleted',
  deleted: 'status.headerDeleted',
}

export function TodoWidgetPreview() {
  const { t } = useTranslation('todoWidget')

  const sections = PREVIEW_VISIBLE.map((status) => ({
    status,
    tasks: PREVIEW_TASKS.filter((task) => task.status === status),
  })).filter((section) => section.tasks.length > 0)

  return (
    <WidgetFrame title={t('title')} pinned={false}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="grid gap-4">
          {sections.map((section) => (
            <section key={section.status} className="grid gap-2">
              <header className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className={clsx('size-1.5 rounded-full', STATUS_DOT_CLASS[section.status])} />
                <span>{t(SECTION_HEADER_KEY[section.status])}</span>
                <span className="opacity-60">({section.tasks.length})</span>
              </header>

              <div className="grid gap-2">
                {section.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={clsx(
                      'rounded-2xl border border-l-4 border-border bg-black/25 px-4 py-4',
                      STATUS_BORDER_CLASS[task.status],
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Button
                        disabled
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="mt-0.5 shrink-0 rounded-full"
                      >
                        <CheckIcon />
                      </Button>

                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold leading-tight">
                          {t(task.titleKey)}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {t(task.descriptionKey)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button disabled type="button" variant="ghost" size="icon-sm">
                          <ChevronLeftIcon />
                        </Button>
                        <Button disabled type="button" variant="ghost" size="icon-sm">
                          <ChevronRightIcon />
                        </Button>
                        <Button disabled type="button" variant="ghost" size="icon-sm">
                          <Trash2Icon />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-1.5">
          {TODO_STATUSES.map((status) => {
            const Icon = STATUS_ICON[status]
            const active = (PREVIEW_VISIBLE as readonly TodoStatus[]).includes(status)
            return (
              <Button
                key={status}
                disabled
                type="button"
                variant="ghost"
                size="icon-sm"
                className={clsx(
                  'shrink-0 rounded-full',
                  active ? STATUS_PILL_CLASS[status] : 'text-muted-foreground',
                )}
              >
                <Icon />
              </Button>
            )
          })}
          <Button disabled size="lg" className="ml-1 flex-1">
            <PlusIcon />
            {t('actions.addTodo')}
          </Button>
          <Button disabled type="button" variant="ghost" size="icon-sm">
            <Settings2Icon />
          </Button>
        </div>
      </div>
    </WidgetFrame>
  )
}
