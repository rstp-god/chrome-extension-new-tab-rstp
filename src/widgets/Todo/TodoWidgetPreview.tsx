import { Button } from '@/components/ui/button.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx'
import { CheckIcon, PlusIcon, Settings2Icon, Trash2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const MOCK_TASKS = [
  {
    id: 'research',
    titleKey: 'form.titlePlaceholder',
    descriptionKey: 'description',
  },
  {
    id: 'draft',
    titleKey: 'dialog.title',
    descriptionKey: 'dialog.description',
  },
  {
    id: 'ship',
    titleKey: 'settings.title',
    descriptionKey: 'settings.description',
  },
] as const

export function TodoWidgetPreview() {
  const { t } = useTranslation('todoWidget')

  return (
    <WidgetFrame title={t('title')} pinned={false}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="grid gap-3">
          {MOCK_TASKS.map((task) => {
            const title = t(task.titleKey)
            const description = t(task.descriptionKey)

            return (
              <div
                key={task.id}
                className="rounded-[2rem] border border-border bg-black/25 px-5 py-5"
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
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium leading-tight text-foreground">{title}</div>
                    <div className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {description}
                    </div>
                  </div>
                  <Button
                    disabled
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-auto space-y-3">
          <Separator />
          <div className="mt-auto flex items-center gap-2">
            <Button disabled type="button" variant="outline" size="icon">
              <CheckIcon />
            </Button>
            <Button disabled type="button" variant="outline" size="icon">
              <Trash2Icon />
            </Button>
            <Button disabled size="lg" className="flex-1">
              <PlusIcon />
              {t('actions.addTodo')}
            </Button>
            <Button disabled type="button" variant="ghost" size="icon-sm">
              <Settings2Icon />
            </Button>
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}
