import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx'
import { useWidgetStore } from '@/store/widget.ts'
import { widgetRegistry } from '@/types/widgets.ts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

function AddWidgetDialog() {
  const { t, i18n } = useTranslation('header')
  const { t: common } = useTranslation('common')

  const [open, setOpen] = useState(false)
  const { addWidget } = useWidgetStore((s) => s)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('addWidget')}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('addWidgetTitle')}</DialogTitle>
        </DialogHeader>
        <div>
          {Object.values(widgetRegistry).map((widget) => {
            const title = widget.meta.titleI18nKey
              ? i18n.t(widget.meta.titleI18nKey)
              : widget.meta.title

            return (
              <div key={widget.meta.widgetType}>
                {title}
                <Button variant="secondary" onClick={() => addWidget(widget.meta.widgetType)}>
                  {common('add')}
                </Button>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AddWidgetDialog
