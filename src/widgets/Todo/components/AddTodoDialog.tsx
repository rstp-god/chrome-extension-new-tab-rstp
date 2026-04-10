import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { LinkableTab, listLinkableTabs } from '@/services/chrome/tabs.ts'
import type { Project } from '@/widgets/Todo/integrations/index.ts'
import { LinkedTab } from '@/widgets/Todo/store/store.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { GlobeIcon, LinkIcon } from 'lucide-react'
import { SubmitEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  onSubmit: (input: {
    title: string
    description: string
    linkedTab?: LinkedTab
    projectId: string | null
  }) => void
}

const NO_PROJECT_VALUE = '__none__'

export function AddTodoDialog({ open, onOpenChange, projects, onSubmit }: Props) {
  const { t } = useTranslation('todoWidget')
  const { t: common } = useTranslation('common')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [linkedTab, setLinkedTab] = useState<LinkedTab | undefined>()
  const [availableTabs, setAvailableTabs] = useState<LinkableTab[]>([])
  const [selectedTabUrl, setSelectedTabUrl] = useState<string>()
  const [tabError, setTabError] = useState<string | null>(null)
  const [projectValue, setProjectValue] = useState<string>(NO_PROJECT_VALUE)

  const selectedTab = useMemo(
    () => availableTabs.find((tab) => tab.url === selectedTabUrl),
    [availableTabs, selectedTabUrl],
  )

  const resetState = () => {
    setTitle('')
    setDescription('')
    setLinkedTab(undefined)
    setAvailableTabs([])
    setSelectedTabUrl(undefined)
    setTabError(null)
    setProjectValue(NO_PROJECT_VALUE)
  }

  useEffect(() => {
    if (!open) return

    void listLinkableTabs().then((tabs) => {
      setAvailableTabs(tabs)
      setSelectedTabUrl((current) => current ?? tabs[0]?.url)
    })
  }, [open])

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) resetState()
  }

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) return

    onSubmit({
      title,
      description,
      linkedTab,
      projectId: projectValue === NO_PROJECT_VALUE ? null : projectValue,
    })
    handleOpenChange(false)
  }

  const handleAttachTab = () => {
    setTabError(null)

    if (!selectedTab?.url) {
      setLinkedTab(undefined)
      setTabError(t('messages.tabUnavailable'))
      return
    }

    const nextLinkedTab: LinkableTab = {
      url: selectedTab.url,
      title: selectedTab.title ?? null,
    }
    setLinkedTab(nextLinkedTab)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-xl" data-testid={TestId.TodoAddDialog}>
        <DialogHeader>
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription>{t('dialog.description')}</DialogDescription>
        </DialogHeader>

        <form className="grid min-w-0 gap-4" onSubmit={handleSubmit}>
          <Field className="min-w-0">
            <FieldLabel htmlFor="todo-title">{t('form.titleLabel')}</FieldLabel>
            <Input
              data-testid={TestId.TodoTitleInput}
              id="todo-title"
              className="min-w-0 max-w-full"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('form.titlePlaceholder')}
            />
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="todo-description">{t('form.descriptionLabel')}</FieldLabel>
            <Textarea
              data-testid={TestId.TodoDescriptionInput}
              id="todo-description"
              className="min-w-0 max-w-full"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('form.descriptionPlaceholder')}
            />
          </Field>

          {projects.length > 0 && (
            <Field className="min-w-0">
              <FieldLabel htmlFor="todo-project">{t('form.projectLabel')}</FieldLabel>
              <Select value={projectValue} onValueChange={setProjectValue}>
                <SelectTrigger id="todo-project" className="w-full">
                  <SelectValue placeholder={t('form.projectNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT_VALUE}>{t('form.projectNone')}</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field className="min-w-0">
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Select
                value={selectedTabUrl}
                onValueChange={(value) => {
                  setSelectedTabUrl(value)
                  setTabError(null)
                }}
              >
                <SelectTrigger
                  data-testid={TestId.TodoTabSelect}
                  className="w-full min-w-0 max-w-full"
                >
                  <SelectValue placeholder={t('form.selectTab')} />
                </SelectTrigger>
                <SelectContent position="popper" className="max-w-[min(32rem,calc(100vw-4rem))]">
                  {availableTabs.length === 0 ? (
                    <SelectItem value="__no-tabs__" disabled>
                      {t('messages.noTabs')}
                    </SelectItem>
                  ) : (
                    availableTabs.map((tab) => (
                      <SelectItem key={tab.url} value={tab.url}>
                        {tab.title ?? tab.url ?? t('messages.untitledTab')}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Button
                data-testid={TestId.TodoAttachTab}
                type="button"
                variant="outline"
                onClick={handleAttachTab}
                className="sm:w-auto"
              >
                <LinkIcon />
                {t('form.attachTab')}
              </Button>
            </div>

            {linkedTab && (
              <div className="min-w-0 rounded-2xl border border-border bg-muted/40 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <GlobeIcon className="size-4" />
                  <span className="truncate">{linkedTab.title ?? t('messages.untitledTab')}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{linkedTab.url}</div>
              </div>
            )}

            {tabError && <p className="text-sm text-destructive">{tabError}</p>}
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {common('close')}
            </Button>
            <Button data-testid={TestId.TodoSubmit} type="submit" disabled={!title.trim()}>
              {t('form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
