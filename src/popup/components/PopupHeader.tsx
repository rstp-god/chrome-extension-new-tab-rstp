import { Switch } from '@/components/ui/switch'
import { useTabRulesStore } from '@/popup/store/tabRules.ts'
import { Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function PopupHeader() {
  const { t } = useTranslation('tabRules')
  const enabled = useTabRulesStore((s) => s.enabled)
  const toggleEnabled = useTabRulesStore((s) => s.toggleEnabled)
  const automationMode = useTabRulesStore((s) => s.automation.mode)
  const debounceMs = useTabRulesStore((s) => s.automation.debounceMs)

  const modeLabel =
    automationMode === 'realtime'
      ? t('header.realtime')
      : automationMode === 'debounce'
        ? t('header.delayed', { seconds: debounceMs / 1000 })
        : t('header.manual')

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <h1 className="text-base font-bold">{t('header.title')}</h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          <Circle
            className={enabled ? 'fill-green-500 text-green-500' : 'text-muted-foreground'}
            size={8}
          />
          <span className={enabled ? 'text-foreground' : 'text-muted-foreground'}>
            {enabled ? t('header.active') : t('header.disabled')}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">{modeLabel}</span>
        <Switch checked={enabled} onCheckedChange={toggleEnabled} />
      </div>
    </div>
  )
}
