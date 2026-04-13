import { Switch } from '@/components/ui/switch'
import { useTabRulesStore } from '@/popup/store/tabRules.ts'
import { Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

export function PopupHeader() {
  const { t } = useTranslation('tabRules')
  const { enabled, toggleEnabled, automation } = useTabRulesStore(
    useShallow((s) => ({
      enabled: s.enabled,
      toggleEnabled: s.toggleEnabled,
      automation: s.automation,
    })),
  )

  const modeLabel =
    automation.mode === 'realtime'
      ? t('header.realtime')
      : automation.mode === 'debounce'
        ? t('header.delayed', { seconds: automation.debounceMs / 1000 })
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
