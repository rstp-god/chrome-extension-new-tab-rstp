import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx'
import { WidgetInstance, widgetRegistry } from '@/types/widgets.ts'
import { useTranslation } from 'react-i18next'

interface Props extends WidgetInstance {
  pinned: boolean
  onRemove?: () => void
}

const RenderWidget = ({ widgetType, pinned, title, onRemove, layout }: Props) => {
  const { t: errors } = useTranslation('errors')
  const { i18n } = useTranslation('common')
  const mod = widgetRegistry[widgetType]

  if (!mod) {
    return (
      <div key={layout.i} className="text-sm text-destructive">
        {errors('widget.notFound')}
      </div>
    )
  }

  const widgetTitle = mod.meta.titleI18nKey ? i18n.t(mod.meta.titleI18nKey) : title
  const Comp = mod.Component

  return (
    <div key={layout.i}>
      <WidgetFrame title={widgetTitle} pinned={pinned} onRemove={onRemove}>
        <Comp />
      </WidgetFrame>
    </div>
  )
}

export default RenderWidget
