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
import { LinkedTab } from '@/widgets/Todo/store.ts'
import { GlobeIcon, LinkIcon } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { title: string; description: string; linkedTab?: LinkedTab }) => void
}

export function AddTodoDialog({ open, onOpenChange, onSubmit }: Props) {
  const { t } = useTranslation('todoWidget')
  const { t: common } = useTranslation('common')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [linkedTab, setLinkedTab] = useState<LinkedTab | undefined>()
  const [availableTabs, setAvailableTabs] = useState<chrome.tabs.Tab[]>([])
  const [selectedTabUrl, setSelectedTabUrl] = useState<string>()
  const [tabError, setTabError] = useState<string | null>(null)

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) return

    onSubmit({ title, description, linkedTab })
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription>{t('dialog.description')}</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="todo-title">{t('form.titleLabel')}</FieldLabel>
            <Input
              id="todo-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('form.titlePlaceholder')}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="todo-description">{t('form.descriptionLabel')}</FieldLabel>
            <Textarea
              id="todo-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('form.descriptionPlaceholder')}
            />
          </Field>

          <Field>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Select
                value={selectedTabUrl}
                onValueChange={(value) => {
                  setSelectedTabUrl(value)
                  setTabError(null)
                }}
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder={t('form.selectTab')} />
                </SelectTrigger>
                <SelectContent position="popper" className="max-w-[min(32rem,calc(100vw-4rem))]">
                  {availableTabs.length === 0 ? (
                    <SelectItem value="__no-tabs__" disabled>
                      {t('messages.noTabs')}
                    </SelectItem>
                  ) : (
                    availableTabs.map((tab) => (
                      <SelectItem key={`${tab.windowId}-${tab.id}`} value={tab.url ?? ''}>
                        {tab.title ?? tab.url ?? t('messages.untitledTab')}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Button
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
              <div className="rounded-2xl border border-border bg-muted/40 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <GlobeIcon className="size-4" />
                  <span>{linkedTab.title ?? t('messages.untitledTab')}</span>
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
            <Button type="submit" disabled={!title.trim()}>
              {t('form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
