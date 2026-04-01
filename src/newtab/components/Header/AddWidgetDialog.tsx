import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { AddWidgetDialogItem } from '@/newtab/components/Header/AddWidgetDialogItem.tsx'
import { AddWidgetDialogPreview } from '@/newtab/components/Header/AddWidgetDialogPreview.tsx'
import { useWidgetStore } from '@/store/widget.ts'
import { WidgetModule, WidgetType, widgetRegistry } from '@/types/widgets.ts'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface AvailableWidgetPreview {
  PreviewComponent?: WidgetModule['PreviewComponent']
}

interface AvailableWidget extends AvailableWidgetPreview {
  description: string
  title: string
  widgetType: WidgetType
}

function AddWidgetDialog() {
  const { t, i18n } = useTranslation('header')
  const { t: common } = useTranslation('common')

  const [open, setOpen] = useState(false)
  const [activeWidgetType, setActiveWidgetType] = useState<WidgetType | null>(null)
  const { addWidget, widgets } = useWidgetStore((s) => s)
  const hasTodoWidget = widgets.some((widget) => widget.widgetType === 'todo')

  const availableWidgets = useMemo(
    () =>
      Object.values(widgetRegistry).reduce<AvailableWidget[]>((acc, widget) => {
        const {
          meta: {
            description: fallbackDescription,
            descriptionI18nKey,
            title: fallbackTitle,
            titleI18nKey,
            widgetType,
          },
          PreviewComponent,
        } = widget

        if (widgetType === 'todo' && hasTodoWidget) {
          return acc
        }

        acc.push({
          widgetType: widgetType as WidgetType,
          title: titleI18nKey ? i18n.t(titleI18nKey) : fallbackTitle,
          description: descriptionI18nKey
            ? i18n.t(descriptionI18nKey)
            : (fallbackDescription ?? ''),
          PreviewComponent,
        })

        return acc
      }, []),
    [hasTodoWidget, i18n],
  )

  const activeWidget =
    availableWidgets.find((widget) => widget.widgetType === activeWidgetType) ?? null
  const clearActiveWidget = () => setActiveWidgetType(null)
  const previewProps = {
    description: activeWidget?.description ?? '',
    previewComingSoonLabel: t('previewComingSoon'),
    templatePreviewLabel: t('templatePreview'),
    title: activeWidget?.title ?? '',
    widget: activeWidget,
  }

  const setDialogOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)

    if (!nextOpen) {
      clearActiveWidget()
    }
  }

  const handleAddWidget = (widgetType: WidgetType) => {
    addWidget(widgetType)
    setDialogOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('addWidget')}</Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg overflow-visible p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{t('addWidgetTitle')}</DialogTitle>
        </DialogHeader>
        <div className="relative rounded-4xl" onMouseLeave={clearActiveWidget}>
          <div className="min-w-0 px-6 pb-6">
            <ScrollArea className="max-h-[70vh] pr-1">
              <div className="grid gap-3 py-1">
                {availableWidgets.map((widget) => {
                  const isActive = activeWidgetType === widget.widgetType

                  return (
                    <AddWidgetDialogItem
                      key={widget.widgetType}
                      addLabel={common('add')}
                      description={widget.description}
                      isActive={isActive}
                      title={widget.title}
                      widgetType={widget.widgetType}
                      onAdd={handleAddWidget}
                      onHover={setActiveWidgetType}
                    />
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        {activeWidget && (
          <div className="pointer-events-none absolute top-0 left-[calc(100%+0.75rem)] z-10 w-[23rem]">
            <div className="absolute top-8 -left-3 h-px w-3 bg-border/70" />
            <div className="absolute top-3 -left-1 bottom-3 w-px bg-border/30" />
            <AddWidgetDialogPreview
              className="pointer-events-auto flex max-h-[min(75vh,calc(100vh-4rem))] flex-col overflow-y-auto rounded-[2rem] border border-border/70 bg-background/96 px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur"
              {...previewProps}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default AddWidgetDialog
