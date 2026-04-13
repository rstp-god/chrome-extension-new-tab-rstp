import { Button } from '@/components/ui/button'
import { Play, Ungroup } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function ActionBar() {
  const { t } = useTranslation('tabRules')

  const handleApplyNow = () => {
    chrome.runtime?.sendMessage?.({ type: 'APPLY_NOW' })
  }

  const handleUngroupAll = () => {
    chrome.runtime?.sendMessage?.({ type: 'UNGROUP_ALL' })
  }

  return (
    <div className="sticky bottom-0 flex gap-2 border-t border-border/50 bg-background px-3 py-2">
      <Button size="sm" className="flex-1 text-xs" onClick={handleApplyNow}>
        <Play size={14} className="mr-1" />
        {t('actions.applyNow')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="flex-1 text-xs text-destructive hover:text-destructive"
        onClick={handleUngroupAll}
      >
        <Ungroup size={14} className="mr-1" />
        {t('actions.ungroupAll')}
      </Button>
    </div>
  )
}
